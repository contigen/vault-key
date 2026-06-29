'use client'

import { useState, useEffect } from 'react'
import { useVault } from '@/components/vault-context'
import { Sidebar } from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SecretReveal } from '@/components/secret-reveal'
import {
  Shield,
  Database,
  Eye,
  Activity,
  Unlock,
  ShieldAlert,
  Users,
  UserPlus,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  useCurrentAccount,
  useDisconnectWallet,
  useSignPersonalMessage,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit'

export default function VaultPage() {
  const { vaultItems, selectedItemId, teams, refreshTeams } = useVault()
  const router = useRouter()
  const account = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage()
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction()

  const [revealStatus, setRevealStatus] = useState<
    'idle' | 'fetching' | 'checking' | 'revealing' | 'denied'
  >('idle')
  const [decryptedSecret, setDecryptedSecret] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteAddress, setInviteAddress] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const selectedItem = vaultItems.find(item => item.id === selectedItemId)

  const associatedTeam =
    selectedItem?.policy === 'allowlist' && selectedItem.allowlistObjectId
      ? teams.find(t => t.id === selectedItem.allowlistObjectId)
      : null

  useEffect(() => {
    if (!account) {
      router.push('/')
    }
  }, [account, router])

  useEffect(() => {
    setRevealStatus('idle')
    setDecryptedSecret(null)
    setErrorMessage('')
    setShowInviteModal(false)
    setInviteAddress('')
    setInviteError('')
  }, [selectedItemId])

  const handleReveal = async () => {
    if (!selectedItem || !account) return
    setErrorMessage('')
    setDecryptedSecret(null)
    setRevealStatus('fetching')

    try {
      const { retrieveAndDecrypt } = await import('@/lib/vaultkey-sdk')

      const signer = {
        getPublicKey: () => ({
          toSuiAddress: () => account.address,
          toRawBytes: () => account.publicKey,
          toBase64: () => btoa(String.fromCharCode(...account.publicKey)),
        }),
        signPersonalMessage: async (message: Uint8Array) => {
          const res = await signPersonalMessage({
            message: message,
          })
          return { signature: res.signature }
        },
      }

      const sdkItem = {
        id: selectedItem.id,
        label: selectedItem.label,
        blobId: selectedItem.blobId,
        policy: selectedItem.policy as any,
        owner: selectedItem.ownerAddress,
        createdAt: Date.now(),
        sealIdHex: selectedItem.sealIdHex,
        allowlistObjectId: selectedItem.allowlistObjectId,
        unlockTimestampMs: selectedItem.unlockTimestampMs,
      }

      const progressTimer = setTimeout(() => setRevealStatus('checking'), 800)

      const secret = await retrieveAndDecrypt(sdkItem, account.address, signer)

      clearTimeout(progressTimer)
      setDecryptedSecret(secret)
      setRevealStatus('revealing')
    } catch (err: any) {
      console.error('Retrieve and decrypt failed:', err)
      const msg =
        err instanceof Error
          ? err.message
          : err
            ? String(err)
            : 'Decryption failed — the key server may have denied access or the session expired.'
      setErrorMessage(msg)
      setRevealStatus('denied')
    }
  }

  const handleInviteMember = async () => {
    if (!inviteAddress || !associatedTeam || !selectedItem) return
    setIsInviting(true)
    setInviteError('')

    try {
      const { inviteTeamMember } = await import('@/lib/vaultkey-sdk')
      const signer = {
        toSuiAddress: () => account!.address,
        signAndExecuteTransaction: async (args: any) => {
          return await signAndExecuteTransaction({
            transaction: args.transaction,
          })
        },
      }

      await inviteTeamMember(
        associatedTeam.id,
        associatedTeam.capId || '', // Must have the AllowlistCap to invite
        inviteAddress,
        signer,
      )

      await refreshTeams()
      setShowInviteModal(false)
      setInviteAddress('')
    } catch (err: any) {
      console.error('Invitation failed:', err)
      setInviteError(
        err.message || 'Failed to invite address to the team allowlist.',
      )
    } finally {
      setIsInviting(false)
    }
  }

  if (!account) return null

  return (
    <div className='flex h-screen w-full bg-vault-floor text-mercury overflow-hidden relative'>
      <Sidebar />

      <main className='flex-1 flex flex-col relative overflow-y-auto'>
        <div className='absolute top-4 right-6'>
          <Button
            variant='ghost'
            className='text-mist hover:text-mercury text-sm'
            onClick={() => {
              disconnect()
              router.push('/')
            }}
          >
            Disconnect
          </Button>
        </div>

        <div className='flex-1 flex items-center justify-center p-8'>
          <div className='max-w-3xl w-full flex flex-col items-center h-full pt-12'>
            {!selectedItem ? (
              <div className='text-center space-y-4 animate-in fade-in duration-700 mt-32'>
                <div className='w-16 h-16 mx-auto rounded-full bg-steel border border-rim flex items-center justify-center'>
                  <Database className='w-6 h-6 text-mist' />
                </div>
                <h3 className='text-xl text-mercury font-medium'>
                  Select a Vault Item
                </h3>
                <p className='text-mist text-sm'>
                  Choose an item from the sidebar to view details or reveal.
                </p>
              </div>
            ) : (
              <div className='w-full max-w-2xl animate-in slide-in-from-right-8 fade-in duration-500'>
                <div className='mb-8'>
                  <h2 className='text-3xl font-medium text-mercury flex items-center gap-3'>
                    {selectedItem.label}
                  </h2>
                  <div className='flex items-center gap-2 mt-3'>
                    <span className='px-2 py-1 bg-steel border border-rim rounded text-xs font-mono text-mist uppercase tracking-widest'>
                      {selectedItem.policy}
                    </span>
                  </div>
                </div>

                {selectedItem.policy === 'allowlist' && associatedTeam && (
                  <Card className='bg-steel border-rim mb-6 animate-in slide-in-from-top-2 duration-300'>
                    <CardContent className='p-4 flex items-center justify-between'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-lg bg-vault-floor border border-rim flex items-center justify-center text-cyan-glow'>
                          <Users className='w-5 h-5' />
                        </div>
                        <div>
                          <div className='text-[10px] text-mist uppercase tracking-widest'>
                            Shared with Team
                          </div>
                          <div className='text-sm font-medium text-mercury mt-0.5'>
                            {associatedTeam.name}
                          </div>
                        </div>
                      </div>

                      <div className='flex items-center gap-4'>
                        <div className='text-right'>
                          <div className='text-[10px] text-mist uppercase tracking-wider'>
                            Members
                          </div>
                          <div className='text-xs font-mono text-mercury mt-0.5'>
                            {associatedTeam.memberCount} Address(es)
                          </div>
                        </div>

                        {associatedTeam.isOwner && (
                          <Button
                            variant='outline'
                            size='sm'
                            className='bg-transparent border-rim text-mercury hover:bg-cyan-glow/10 hover:border-cyan-glow/50 hover:text-cyan-glow text-xs h-8 rounded-full'
                            onClick={() => setShowInviteModal(true)}
                          >
                            <UserPlus className='w-3.5 h-3.5 mr-1.5' /> Invite
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className='bg-steel border-rim mb-6'>
                  <CardContent className='p-0'>
                    <div className='grid grid-cols-3 border-b border-rim'>
                      <div className='p-4 border-r border-rim'>
                        <div className='text-[10px] text-mist uppercase tracking-widest mb-1'>
                          Status
                        </div>
                        <div className='text-sm text-mercury flex items-center gap-2'>
                          <div className='w-2 h-2 rounded-full bg-emerald-500/50 border border-emerald-500' />
                          Encrypted
                        </div>
                      </div>
                      <div className='p-4 border-r border-rim col-span-2'>
                        <div className='text-[10px] text-mist uppercase tracking-widest mb-1'>
                          Sui Object ID
                        </div>
                        <div className='text-sm text-mercury font-mono truncate'>
                          {selectedItem.objectId}
                        </div>
                      </div>
                    </div>
                    <div className='p-4'>
                      <div className='text-[10px] text-mist uppercase tracking-widest mb-1'>
                        Walrus Blob ID
                      </div>
                      <div className='text-sm text-mercury font-mono truncate'>
                        {selectedItem.blobId}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className='bg-vault-floor border border-rim rounded-xl p-8 relative overflow-hidden min-h-[250px] flex flex-col justify-center items-center'>
                  {revealStatus === 'idle' && (
                    <div className='text-center z-10 animate-in zoom-in-95 duration-300'>
                      <Shield className='w-12 h-12 text-mist mx-auto mb-4 opacity-50' />
                      <Button
                        variant='outline'
                        onClick={handleReveal}
                        className='bg-transparent border-rim text-mercury hover:bg-cyan-glow/10 hover:border-cyan-glow/50 hover:text-cyan-glow transition-all group px-8 py-6 rounded-full'
                      >
                        <Eye className='w-5 h-5 mr-3 opacity-50 group-hover:opacity-100 group-hover:text-cyan-glow transition-all' />
                        <span className='tracking-widest uppercase text-xs font-bold'>
                          Reveal Secret
                        </span>
                      </Button>
                    </div>
                  )}

                  {(revealStatus === 'fetching' ||
                    revealStatus === 'checking') && (
                    <div className='text-center z-10 space-y-4 animate-in fade-in duration-300'>
                      <Activity className='w-8 h-8 text-mist mx-auto animate-pulse' />
                      <div className='text-sm font-mono text-mist uppercase tracking-widest flex items-center justify-center gap-2'>
                        {revealStatus === 'fetching'
                          ? 'Fetching from Walrus...'
                          : 'Checking Seal Policy...'}
                      </div>
                    </div>
                  )}

                  {revealStatus === 'revealing' && (
                    <div className='w-full text-center z-10'>
                      <div className='text-[10px] text-cyan-glow uppercase tracking-widest mb-4 opacity-80 flex items-center justify-center gap-2'>
                        <Unlock className='w-3 h-3' /> Decrypted Successfully
                      </div>
                      <div className='p-6 bg-cyan-glow/5 border border-cyan-glow/20 rounded-lg inline-block w-full max-w-lg'>
                        <SecretReveal
                          secret={decryptedSecret || ''}
                          isRevealing={true}
                          className='text-2xl tracking-wider text-mercury font-mono break-all'
                        />
                      </div>
                    </div>
                  )}

                  {revealStatus === 'denied' && (
                    <div className='w-full text-center z-10 p-6 bg-red-500/5 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-bottom-4 duration-500'>
                      <ShieldAlert className='w-12 h-12 text-red-500 mx-auto mb-4' />
                      <h4 className='text-red-500 font-medium mb-2 uppercase tracking-widest text-sm'>
                        Access Denied
                      </h4>
                      <p className='text-red-500/70 text-sm font-mono'>
                        {errorMessage ||
                          'Seal Policy Check Failed: Caller does not match owner-only policy requirements.'}
                      </p>
                      <Button
                        variant='ghost'
                        className='mt-6 text-mist hover:text-mercury text-xs uppercase tracking-widest border border-rim'
                        onClick={() => setRevealStatus('idle')}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {showInviteModal && associatedTeam && (
        <div className='absolute inset-0 bg-vault-floor/80 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
          <div className='bg-steel border border-rim rounded-xl w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-200'>
            <div className='flex items-center justify-between'>
              <h3 className='font-semibold text-mercury text-sm uppercase tracking-wider flex items-center gap-2'>
                <UserPlus className='w-4 h-4 text-cyan-glow' /> Add Member
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className='text-mist hover:text-mercury'
              >
                <X className='w-4 h-4' />
              </button>
            </div>

            {inviteError && (
              <div className='p-3 bg-red-950/20 border border-red-500/25 rounded text-red-400 text-xs font-mono'>
                {inviteError}
              </div>
            )}

            <div className='space-y-1'>
              <label className='text-[10px] uppercase text-mist tracking-wider'>
                Invite Member Address
              </label>
              <input
                type='text'
                value={inviteAddress}
                onChange={e => setInviteAddress(e.target.value)}
                placeholder='0x...'
                className='w-full bg-vault-floor border border-rim rounded p-2 text-xs text-mercury focus:outline-none focus:border-cyan-glow/50 font-mono'
              />
            </div>

            <div className='flex gap-2 pt-2'>
              <Button
                variant='outline'
                onClick={() => setShowInviteModal(false)}
                className='flex-1 bg-transparent border-rim text-mercury'
              >
                Cancel
              </Button>
              <Button
                onClick={handleInviteMember}
                disabled={!inviteAddress || isInviting}
                className='flex-1 bg-cyan-glow/10 text-cyan-glow hover:bg-cyan-glow/20 border border-cyan-glow/30'
              >
                {isInviting ? 'Adding...' : 'Add to Team'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
