import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc'
import { Transaction } from '@mysten/sui/transactions'
import { fromHex, toHex } from '@mysten/sui/utils'
import { bcs } from '@mysten/sui/bcs'
import { SealClient, SessionKey } from '@mysten/seal'
import { WalrusClient } from '@mysten/walrus'

export const PACKAGE_ID =
  '0x6061bad1fdba5a5359e26c47a951db94762c8a52699c4b5cef97f0cddaada708'

const TESTNET_RPC = 'https://fullnode.testnet.sui.io:443'

const SEAL_SERVER_CONFIGS = [
  {
    // Mysten Labs decentralized key server (testnet) — needs aggregatorUrl
    objectId:
      '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
    weight: 1,
  },
  {
    // Mysten Labs independent key server mysten-testnet-1 — no aggregatorUrl needed
    objectId:
      '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
    weight: 1,
  },
]

export const suiClient = new SuiClient({ url: TESTNET_RPC, network: 'testnet' })

export const sealClient = new SealClient({
  suiClient,
  serverConfigs: SEAL_SERVER_CONFIGS,
  verifyKeyServers: false, // set true in prod
})

export const walrusClient = new WalrusClient({
  network: 'testnet',
  suiClient,
  uploadRelay: {
    host: 'https://upload-relay.testnet.walrus.space',
    sendTip: {
      max: 10000,
    },
  },
})

export type PolicyType = 'owner' | 'allowlist' | 'timelock'

export interface StoreResult {
  blobId: string
  objectId: string
  capId: string
}

export interface VaultEntryMeta {
  id: string
  label: string
  blobId: string
  policy: PolicyType
  owner: string
  createdAt: number
  /// The Seal IBE identity as a 0x-prefixed hex string.
  /// Stored on-chain in the seal_id field, recovered via fetchVault().
  sealIdHex: string
  allowlistObjectId?: string
  // For timelock policy: the unlock timestamp in ms
  unlockTimestampMs?: number
  // The matching VaultCap ID owned by the user (if any)
  capId?: string
}

// Helper to extract objectChanges from transaction response, querying RPC block if needed
async function getObjectChanges(result: any): Promise<any[]> {
  const txResult = result?.Transaction ?? result
  if (txResult?.objectChanges) {
    return txResult.objectChanges
  }
  const digest = txResult?.digest ?? result?.digest
  if (digest) {
    // Retry querying the RPC node up to 6 times to allow the indexer to complete
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const txResponse = await suiClient.getTransactionBlock({
          digest,
          options: { showObjectChanges: true },
        })
        if (txResponse.objectChanges) {
          return txResponse.objectChanges
        }
      } catch (e) {
        if (attempt === 6) {
          console.error(
            'Failed to fetch transaction block for objectChanges after retries:',
            e,
          )
        } else {
          await new Promise(resolve => setTimeout(resolve, 800))
        }
      }
    }
  }
  return []
}

export async function encryptAndStore(
  label: string,
  secret: string,
  policy: PolicyType,
  walletAddress: string,
  signer: any,
  policyOptions?: {
    allowlistObjectId?: string
    allowlistCapId?: string
    unlockTimestampMs?: number
  },
): Promise<StoreResult> {
  let sealIdHex: string

  if (policy === 'timelock' && policyOptions?.unlockTimestampMs) {
    const tsBytes = bcs
      .u64()
      .serialize(BigInt(policyOptions.unlockTimestampMs))
      .toBytes()
    sealIdHex = '0x' + toHex(tsBytes)
  } else {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    sealIdHex = '0x' + toHex(randomBytes)
  }

  const data = new TextEncoder().encode(secret)

  const { encryptedObject: encryptedBytes } = await sealClient.encrypt({
    threshold: 2,
    packageId: PACKAGE_ID,
    id: sealIdHex,
    data,
  })

  const { blobId } = await walrusClient.writeBlob({
    blob: encryptedBytes,
    deletable: true,
    epochs: 5,
    signer,
  })

  const tx = new Transaction()

  if (
    policy === 'allowlist' &&
    policyOptions?.allowlistObjectId &&
    policyOptions?.allowlistCapId
  ) {
    const [entry, cap] = tx.moveCall({
      target: `${PACKAGE_ID}::vault::store_secret`,
      arguments: [
        tx.pure(bcs.string().serialize(label).toBytes()),
        tx.pure(bcs.string().serialize(blobId).toBytes()),
        tx.pure(bcs.string().serialize(policy).toBytes()),
        tx.pure(bcs.string().serialize(sealIdHex).toBytes()),
        tx.pure(
          bcs.string().serialize(policyOptions.allowlistObjectId).toBytes(),
        ),
        tx.pure.u64(Date.now()),
      ],
    })
    tx.moveCall({
      target: `${PACKAGE_ID}::allowlist::link_secret`,
      arguments: [
        tx.object(policyOptions.allowlistObjectId),
        tx.object(policyOptions.allowlistCapId),
        entry,
      ],
    })
    tx.transferObjects([entry, cap], walletAddress)
  } else {
    tx.moveCall({
      target: `${PACKAGE_ID}::vault::store_and_keep`,
      arguments: [
        tx.pure(bcs.string().serialize(label).toBytes()),
        tx.pure(bcs.string().serialize(blobId).toBytes()),
        tx.pure(bcs.string().serialize(policy).toBytes()),
        tx.pure(bcs.string().serialize(sealIdHex).toBytes()),
        tx.pure(
          bcs
            .string()
            .serialize(policyOptions?.allowlistObjectId ?? '')
            .toBytes(),
        ),
        tx.pure.u64(Date.now()),
      ],
    })
  }

  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
    options: {
      showObjectChanges: true,
    },
  })

  const createdObjects = (await getObjectChanges(result)).filter(
    (c: any) => c.type === 'created',
  )
  const entryObj = createdObjects.find((o: any) =>
    o.objectType?.includes('::vault::VaultEntry'),
  )
  const capObj = createdObjects.find((o: any) =>
    o.objectType?.includes('::vault::VaultCap'),
  )

  return {
    blobId,
    objectId: entryObj?.objectId ?? '',
    capId: capObj?.objectId ?? '',
  }
}

export async function retrieveAndDecrypt(
  item: VaultEntryMeta,
  walletAddress: string,
  signer: any,
): Promise<string> {
  const encryptedBytes = await walrusClient.readBlob({ blobId: item.blobId })

  const sessionKey = await SessionKey.create({
    address: walletAddress,
    packageId: PACKAGE_ID,
    ttlMin: 10,
    signer,
    suiClient,
  })

  const tx = new Transaction()
  const sealIdBytes = fromHex(item.sealIdHex)

  if (item.policy === 'owner') {
    tx.moveCall({
      target: `${PACKAGE_ID}::owner_policy::seal_approve`,
      arguments: [
        tx.pure(
          bcs.vector(bcs.u8()).serialize(Array.from(sealIdBytes)).toBytes(),
        ),
        tx.object(item.id),
      ],
    })
  } else if (item.policy === 'allowlist' && item.allowlistObjectId) {
    tx.moveCall({
      target: `${PACKAGE_ID}::allowlist::seal_approve`,
      arguments: [
        tx.pure(
          bcs.vector(bcs.u8()).serialize(Array.from(sealIdBytes)).toBytes(),
        ),
        tx.object(item.allowlistObjectId),
      ],
    })
  } else if (item.policy === 'timelock' && item.unlockTimestampMs) {
    const timeLockBytes = bcs
      .u64()
      .serialize(BigInt(item.unlockTimestampMs))
      .toBytes()
    tx.moveCall({
      target: `${PACKAGE_ID}::timelock::seal_approve`,
      arguments: [
        tx.pure(
          bcs.vector(bcs.u8()).serialize(Array.from(timeLockBytes)).toBytes(),
        ),
        tx.object('0x6'), // Sui Clock shared object
      ],
    })
  }

  const txBytes = await tx.build({
    client: suiClient,
    onlyTransactionKind: true,
  })

  const decryptedBytes = await sealClient.decrypt({
    data: encryptedBytes,
    sessionKey,
    txBytes,
  })

  return new TextDecoder().decode(decryptedBytes)
}

export async function fetchVault(
  ownerAddress: string,
): Promise<VaultEntryMeta[]> {
  const { data: entries } = await suiClient.getOwnedObjects({
    owner: ownerAddress,
    filter: { StructType: `${PACKAGE_ID}::vault::VaultEntry` },
    options: { showContent: true },
  })

  const { data: caps } = await suiClient.getOwnedObjects({
    owner: ownerAddress,
    filter: { StructType: `${PACKAGE_ID}::vault::VaultCap` },
    options: { showContent: true },
  })

  const capMap = new Map<string, string>()
  for (const obj of caps) {
    if (obj.data?.content?.dataType === 'moveObject') {
      const fields = obj.data.content.fields as any
      if (fields?.entry_id) {
        capMap.set(fields.entry_id, obj.data.objectId)
      }
    }
  }

  return entries.map((obj: any) => {
    const fields = obj.data?.content?.fields ?? {}
    const sealIdHex: string = fields.seal_id ?? '0x'
    const allowlistId: string = fields.allowlist_id ?? ''
    const entryId = obj.data?.objectId ?? ''

    return {
      id: entryId,
      label: fields.label ?? '',
      blobId: fields.blob_id ?? '',
      policy: fields.policy as PolicyType,
      owner: fields.owner ?? '',
      createdAt: Number(fields.created_at ?? 0),
      sealIdHex,
      allowlistObjectId: allowlistId || undefined,
      capId: capMap.get(entryId),
    }
  })
}

export async function deleteSecret(
  entryObjectId: string,
  capObjectId: string,
  signer: any,
  allowlistObjectId?: string,
  allowlistCapId?: string,
): Promise<void> {
  const tx = new Transaction()

  if (allowlistObjectId && allowlistCapId) {
    tx.moveCall({
      target: `${PACKAGE_ID}::allowlist::unlink_secret`,
      arguments: [
        tx.object(allowlistObjectId),
        tx.object(allowlistCapId),
        tx.pure.id(entryObjectId),
      ],
    })
  }

  tx.moveCall({
    target: `${PACKAGE_ID}::vault::delete_secret`,
    arguments: [tx.object(entryObjectId), tx.object(capObjectId)],
  })

  await signer.signAndExecuteTransaction({ transaction: tx })
}

export interface TeamInfo {
  id: string
  name: string
  owner: string
  memberCount: number
  isOwner: boolean
  capId?: string
}

export async function createTeam(
  name: string,
  members: string[],
  signer: any,
): Promise<{ teamId: string; capId: string }> {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::allowlist::create_allowlist`,
    arguments: [tx.pure(bcs.string().serialize(name).toBytes())],
  })

  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
    options: {
      showObjectChanges: true,
    },
  })

  const createdObjects = (await getObjectChanges(result)).filter(
    (c: any) => c.type === 'created',
  )
  const listObj = createdObjects.find(
    (o: any) =>
      o.objectType?.includes('::allowlist::Allowlist') &&
      !o.objectType?.includes('::allowlist::AllowlistCap'),
  )
  const capObj = createdObjects.find((o: any) =>
    o.objectType?.includes('::allowlist::AllowlistCap'),
  )

  const teamId = listObj?.objectId ?? ''
  const capId = capObj?.objectId ?? ''

  if (members.length > 0 && teamId && capId) {
    const addTx = new Transaction()
    for (const member of members) {
      addTx.moveCall({
        target: `${PACKAGE_ID}::allowlist::add_member`,
        arguments: [
          addTx.object(teamId),
          addTx.object(capId),
          addTx.pure.address(member),
        ],
      })
    }
    await signer.signAndExecuteTransaction({ transaction: addTx })
  }

  return { teamId, capId }
}

export async function fetchTeams(
  walletAddress: string,
  joinedTeamIds: string[] = [],
): Promise<TeamInfo[]> {
  const teams: TeamInfo[] = []

  const { data: capObjects } = await suiClient.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: `${PACKAGE_ID}::allowlist::AllowlistCap` },
    options: { showContent: true },
  })

  const { data: membershipObjects } = await suiClient.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: `${PACKAGE_ID}::allowlist::TeamMembership` },
    options: { showContent: true },
  })

  const ownedListIds: string[] = []
  const capIdMap = new Map<string, string>()

  for (const obj of capObjects) {
    if (obj.data?.content?.dataType === 'moveObject') {
      const fields = obj.data.content.fields as any
      if (fields?.list_id) {
        ownedListIds.push(fields.list_id)
        capIdMap.set(fields.list_id, obj.data.objectId)
      }
    }
  }

  const memberListIds: string[] = []
  for (const obj of membershipObjects) {
    if (obj.data?.content?.dataType === 'moveObject') {
      const fields = obj.data.content.fields as any
      if (fields?.list_id) {
        memberListIds.push(fields.list_id)
      }
    }
  }

  const allTeamIds = Array.from(
    new Set([...ownedListIds, ...memberListIds, ...joinedTeamIds]),
  )
  if (allTeamIds.length === 0) return []

  const teamObjects = await suiClient.multiGetObjects({
    ids: allTeamIds,
    options: { showContent: true },
  })

  for (const obj of teamObjects) {
    if (obj.data?.content?.dataType === 'moveObject') {
      const fields = obj.data.content.fields as any
      const listId = obj.data.objectId
      const name = fields?.name ?? 'Unnamed Team'
      const owner = fields?.owner ?? ''

      let memberCount = 0
      try {
        const dfResult = await suiClient.getDynamicFields({ parentId: listId })
        memberCount =
          dfResult.data.filter(
            f =>
              f.name &&
              typeof f.name === 'object' &&
              f.name.type &&
              f.name.type.includes('::allowlist::MemberKey'),
          ).length + 1
      } catch (e) {
        console.error('Failed to fetch dynamic fields for team:', listId, e)
      }

      teams.push({
        id: listId,
        name,
        owner,
        memberCount,
        isOwner: owner === walletAddress,
        capId: capIdMap.get(listId),
      })
    }
  }

  return teams
}

export async function fetchTeamSecrets(
  teamObjectId: string,
): Promise<VaultEntryMeta[]> {
  if (!teamObjectId || teamObjectId === '' || !teamObjectId.startsWith('0x')) {
    return []
  }
  let dynamicFields: any[] = []
  try {
    const dfResult = await suiClient.getDynamicFields({
      parentId: teamObjectId,
    })
    dynamicFields = dfResult.data
  } catch (e) {
    console.error('Failed to fetch dynamic fields for team:', teamObjectId, e)
    return []
  }

  const entryIds = dynamicFields
    .filter(
      f =>
        f.name &&
        typeof f.name === 'object' &&
        f.name.type &&
        f.name.type.includes('::allowlist::SecretKey'),
    )
    .map(f => (f.name.value as { entry_id: string }).entry_id)

  if (entryIds.length === 0) return []

  const objects = await suiClient.multiGetObjects({
    ids: entryIds,
    options: { showContent: true },
  })

  const items: VaultEntryMeta[] = []
  for (const obj of objects) {
    if (obj.data?.content?.dataType === 'moveObject') {
      const fields = obj.data.content.fields as any
      const allowlistId = fields?.allowlist_id ?? ''
      const sealIdHex = fields?.seal_id ?? '0x'
      items.push({
        id: obj.data.objectId,
        label: fields?.label ?? '',
        blobId: fields?.blob_id ?? '',
        policy: fields?.policy as PolicyType,
        owner: fields?.owner ?? '',
        createdAt: Number(fields?.created_at ?? 0),
        sealIdHex,
        allowlistObjectId: allowlistId || undefined,
      })
    }
  }
  return items
}

export async function inviteTeamMember(
  teamObjectId: string,
  capObjectId: string,
  memberAddress: string,
  signer: any,
): Promise<void> {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::allowlist::add_member`,
    arguments: [
      tx.object(teamObjectId),
      tx.object(capObjectId),
      tx.pure.address(memberAddress),
    ],
  })
  await signer.signAndExecuteTransaction({ transaction: tx })
}

export async function burnMembership(
  membershipObjectId: string,
  signer: any,
): Promise<void> {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::allowlist::burn_membership`,
    arguments: [tx.object(membershipObjectId)],
  })
  await signer.signAndExecuteTransaction({ transaction: tx })
}
