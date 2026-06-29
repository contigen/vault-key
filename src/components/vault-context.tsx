'use client'

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react'
import { useCurrentAccount } from '@mysten/dapp-kit'

export type VaultItem = {
  id: string // matches SDK objectId (on-chain VaultEntry ID)
  label: string
  policy: string
  blobId: string
  objectId: string // duplicate for UI backward compatibility
  encryptedSecret: string
  originalSecret?: string // populated after decryption
  ownerAddress: string
  sealIdHex: string
  allowlistObjectId?: string
  allowlistCapId?: string // added to allow unlinking on delete
  unlockTimestampMs?: number
  capId?: string
}

export type Team = {
  id: string
  name: string
  owner: string
  memberCount: number
  isOwner: boolean
  capId?: string
}

type VaultContextType = {
  vaultItems: VaultItem[]
  addVaultItem: (item: VaultItem) => void
  selectedItemId: string | null
  setSelectedItemId: (id: string | null) => void
  refreshVault: () => Promise<void>
  isLoading: boolean

  teams: Team[]
  selectedTeamId: string | null
  setSelectedTeamId: (id: string | null) => void
  refreshTeams: () => Promise<void>
  addTeam: (team: Team) => void
}

const VaultContext = createContext<VaultContextType | undefined>(undefined)

export function VaultProvider({ children }: { children: ReactNode }) {
  const account = useCurrentAccount()
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  const refreshVault = async () => {
    if (!account) {
      setVaultItems([])
      return
    }

    setIsLoading(true)
    try {
      const { fetchVault, fetchTeamSecrets } =
        await import('@/lib/vaultkey-sdk')

      const realItems = await fetchVault(account.address)

      const teamSecretsPromises = teams.map(t => fetchTeamSecrets(t.id))
      const teamSecretsArrays = await Promise.all(teamSecretsPromises)
      const allTeamSecrets = teamSecretsArrays.flat()

      // 3. Merge and deduplicate by secret object ID
      const mergedMap = new Map<string, VaultItem>()

      realItems.forEach(item => {
        // Find corresponding team cap if this is an allowlist policy secret the user owns
        const matchingTeam = teams.find(t => t.id === item.allowlistObjectId)
        mergedMap.set(item.id, {
          id: item.id,
          label: item.label,
          policy: item.policy,
          blobId: item.blobId,
          objectId: item.id,
          encryptedSecret: '',
          originalSecret: undefined,
          ownerAddress: item.owner,
          sealIdHex: item.sealIdHex,
          allowlistObjectId: item.allowlistObjectId,
          allowlistCapId: matchingTeam?.capId,
          unlockTimestampMs: item.unlockTimestampMs,
          capId: item.capId,
        })
      })

      allTeamSecrets.forEach(item => {
        if (!mergedMap.has(item.id)) {
          const matchingTeam = teams.find(t => t.id === item.allowlistObjectId)
          mergedMap.set(item.id, {
            id: item.id,
            label: item.label,
            policy: item.policy,
            blobId: item.blobId,
            objectId: item.id,
            encryptedSecret: '',
            originalSecret: undefined,
            ownerAddress: item.owner,
            sealIdHex: item.sealIdHex,
            allowlistObjectId: item.allowlistObjectId,
            allowlistCapId: matchingTeam?.capId,
            unlockTimestampMs: item.unlockTimestampMs,
            capId: item.capId,
          })
        }
      })

      setVaultItems(Array.from(mergedMap.values()))
    } catch (err) {
      console.error('Failed to fetch vault items from chain:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshTeams = async () => {
    if (!account) {
      setTeams([])
      return
    }

    try {
      const { fetchTeams } = await import('@/lib/vaultkey-sdk')
      const realTeams = await fetchTeams(account.address)

      const mappedTeams: Team[] = realTeams.map(t => ({
        id: t.id,
        name: t.name,
        owner: t.owner,
        memberCount: t.memberCount,
        isOwner: t.isOwner,
        capId: t.capId,
      }))

      setTeams(mappedTeams)
    } catch (err) {
      console.error('Failed to fetch teams from chain:', err)
    }
  }

  useEffect(() => {
    refreshTeams().then(() => {
      refreshVault()
    })
  }, [account?.address, teams.length])

  useEffect(() => {
    if (account?.address) {
      refreshVault()
    }
  }, [selectedTeamId])

  const addVaultItem = (item: VaultItem) => {
    setVaultItems(prev => {
      const exists = prev.some(x => x.id === item.id)
      if (exists) return prev
      return [...prev, item]
    })
  }

  const addTeam = (team: Team) => {
    setTeams(prev => {
      const exists = prev.some(x => x.id === team.id)
      if (exists) return prev
      return [...prev, team]
    })
  }

  return (
    <VaultContext.Provider
      value={{
        vaultItems,
        addVaultItem,
        selectedItemId,
        setSelectedItemId,
        refreshVault,
        isLoading,

        teams,
        selectedTeamId,
        setSelectedTeamId,
        refreshTeams,
        addTeam,
      }}
    >
      {children}
    </VaultContext.Provider>
  )
}

export function useVault() {
  const context = useContext(VaultContext)
  if (context === undefined) {
    throw new Error('useVault must be used within a VaultProvider')
  }
  return context
}
