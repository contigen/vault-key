'use client'

import { useState, useEffect } from 'react'
import { useVault } from '@/components/vault-context'
import { Sidebar } from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Lock,
  Shield,
  Database,
  Link as LinkIcon,
  CheckCircle2,
  Users,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit'
import type { PolicyType } from '@/lib/vaultkey-sdk'

export default function StorePage() {
  const { addVaultItem, setSelectedItemId, teams } = useVault()
  const router = useRouter()
  const account = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction()

  const [storeLabel, setStoreLabel] = useState('')
  const [storeSecret, setStoreSecret] = useState('')
  const [storePolicy, setStorePolicy] = useState('owner-only')
  const [selectedTeamIdForSecret, setSelectedTeamIdForSecret] = useState('')
  const [storeStatus, setStoreStatus] = useState<
    'idle' | 'encrypting' | 'storing' | 'writing' | 'success'
  >('idle')
  const [createdBlobId, setCreatedBlobId] = useState('')
  const [createdObjectId, setCreatedObjectId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!account) {
      router.push('/')
    }
  }, [account, router])

  useEffect(() => {
    if (
      storePolicy === 'allowlist' &&
      teams.length > 0 &&
      !selectedTeamIdForSecret
    ) {
      setSelectedTeamIdForSecret(teams[0].id)
    }
  }, [storePolicy, teams])

  const handleStore = async () => {
    if (!storeLabel || !storeSecret || !account) return
    if (storePolicy === 'allowlist' && !selectedTeamIdForSecret) return

    setStoreStatus('encrypting')
    setErrorMessage('')

    const progressTimer1 = setTimeout(() => setStoreStatus('storing'), 1000)
    const progressTimer2 = setTimeout(() => setStoreStatus('writing'), 2500)

    try {
      // Dynamically import the SDK to prevent Next.js server-side wasm errors during build
      const { encryptAndStore } = await import('@/lib/vaultkey-sdk')

      // Wrapper around dapp-kit mutateAsync to match the SDK expectation
      const signer = {
        toSuiAddress: () => account.address,
        signAndExecuteTransaction: async (args: any) => {
          const res = await signAndExecuteTransaction({
            transaction: args.transaction,
          })
          return {
            Transaction: {
              digest: res.digest,
              effects: res.effects,
            },
          }
        },
      }

      let sdkPolicy: PolicyType = 'owner'
      const policyOptions: any = {}

      if (storePolicy === 'allowlist') {
        sdkPolicy = 'allowlist'
        policyOptions.allowlistObjectId = selectedTeamIdForSecret
        const matchedTeam = teams.find(t => t.id === selectedTeamIdForSecret)
        if (matchedTeam) {
          policyOptions.allowlistCapId = matchedTeam.capId
        }
      } else if (storePolicy === 'time-locked') {
        sdkPolicy = 'timelock'
        policyOptions.unlockTimestampMs = Date.now() + 60 * 60 * 1000
      }

      const result = await encryptAndStore(
        storeLabel,
        storeSecret,
        sdkPolicy,
        account.address,
        signer,
        policyOptions,
      )

      clearTimeout(progressTimer1)
      clearTimeout(progressTimer2)

      if (!result.objectId) {
        throw new Error(
          'Failed to retrieve the on-chain Object ID from transaction changes.',
        )
      }

      setCreatedBlobId(result.blobId)
      setCreatedObjectId(result.objectId)

      const newItem = {
        id: result.objectId,
        label: storeLabel,
        policy: sdkPolicy,
        blobId: result.blobId,
        objectId: result.objectId,
        encryptedSecret: '',
        originalSecret: storeSecret,
        ownerAddress: account.address,
        sealIdHex: '0x', // Stored as placeholder; fetchVault will fetch real value from chain
        allowlistObjectId:
          sdkPolicy === 'allowlist' ? selectedTeamIdForSecret : undefined,
      }

      addVaultItem(newItem)
      setStoreStatus('success')
    } catch (err: any) {
      clearTimeout(progressTimer1)
      clearTimeout(progressTimer2)
      console.error('Encryption and storage failed:', err)
      setErrorMessage(
        err.message || 'An unexpected error occurred during execution.',
      )
      setStoreStatus('idle')
    }
  }

  const resetStore = () => {
    setStoreLabel('')
    setStoreSecret('')
    setStoreStatus('idle')
    setSelectedItemId(null)
    router.push('/vault')
  }

  const isStoreDisabled =
    !storeLabel ||
    !storeSecret ||
    (storePolicy === 'allowlist' && !selectedTeamIdForSecret)

  if (!account) return null

  return (
    <div className='flex h-screen w-full bg-vault-floor text-mercury overflow-hidden'>
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
          <div className='max-w-xl w-full animate-in fade-in slide-in-from-bottom-4 duration-500'>
            <div className='mb-8'>
              <h2 className='text-2xl font-medium text-mercury flex items-center gap-3'>
                <Lock className='w-6 h-6 text-mist' />
                Store New Secret
              </h2>
              <p className='text-mist text-sm mt-2'>
                Encrypt a credential locally and distribute it to Walrus.
              </p>
            </div>

            {errorMessage && (
              <div className='mb-6 p-4 bg-red-950/30 border border-red-500/30 rounded-lg text-red-400 text-sm'>
                <p className='font-semibold'>Error Occurred:</p>
                <p className='mt-1 font-mono text-xs'>{errorMessage}</p>
              </div>
            )}

            {storeStatus === 'idle' && (
              <Card className='bg-steel border-rim shadow-2xl'>
                <CardContent className='space-y-6 pt-6'>
                  <div className='space-y-2'>
                    <Label
                      htmlFor='label'
                      className='text-mist text-xs uppercase tracking-wider'
                    >
                      Secret Label
                    </Label>
                    <Input
                      id='label'
                      value={storeLabel}
                      onChange={e => setStoreLabel(e.target.value)}
                      placeholder='e.g. Mainnet Deployer Key'
                      className='bg-vault-floor border-rim text-mercury focus-visible:ring-[#00f0ff]/50'
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label
                      htmlFor='secret'
                      className='text-mist text-xs uppercase tracking-wider'
                    >
                      Secret Data
                    </Label>
                    <Textarea
                      id='secret'
                      value={storeSecret}
                      onChange={e => setStoreSecret(e.target.value)}
                      placeholder='0x...'
                      className='bg-vault-floor border-rim text-mercury font-mono min-h-[120px] focus-visible:ring-[#00f0ff]/50'
                    />
                  </div>

                  <div className='space-y-4'>
                    <div className='space-y-2'>
                      <Label className='text-mist text-xs uppercase tracking-wider'>
                        Access Policy
                      </Label>
                      <Select
                        value={storePolicy}
                        onValueChange={val => {
                          if (val) setStorePolicy(val)
                        }}
                      >
                        <SelectTrigger className='bg-vault-floor border-rim text-mercury'>
                          <SelectValue placeholder='Select policy' />
                        </SelectTrigger>
                        <SelectContent className='bg-steel border-rim min-w-[240px]'>
                          <SelectItem
                            value='owner-only'
                            className='text-mercury focus:bg-vault-floor focus:text-white'
                          >
                            Owner Only
                          </SelectItem>
                          <SelectItem
                            value='allowlist'
                            className='text-mercury focus:bg-vault-floor focus:text-white'
                          >
                            Address Allowlist (Team)
                          </SelectItem>
                          <SelectItem
                            value='time-locked'
                            disabled
                            className='text-mercury focus:bg-vault-floor focus:text-white'
                          >
                            Time-locked
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {storePolicy === 'allowlist' && (
                      <div className='space-y-2 animate-in slide-in-from-top-2 duration-200'>
                        <Label className='text-mist text-xs uppercase tracking-wider flex items-center gap-1.5'>
                          <Users className='w-3.5 h-3.5 text-mist' /> Scope to
                          Team Allowlist
                        </Label>
                        {teams.length === 0 ? (
                          <div className='text-xs text-red-400 bg-red-950/20 border border-red-500/20 p-3 rounded'>
                            You must create a team first before you can scope a
                            secret to an allowlist.
                          </div>
                        ) : (
                          <Select
                            value={selectedTeamIdForSecret}
                            onValueChange={val => {
                              if (val) setSelectedTeamIdForSecret(val)
                            }}
                          >
                            <SelectTrigger className='bg-vault-floor border-rim text-mercury font-sans'>
                              <span className='truncate'>
                                {teams.find(
                                  t => t.id === selectedTeamIdForSecret,
                                )?.name || 'Select a team'}
                              </span>
                            </SelectTrigger>
                            <SelectContent className='bg-steel border-rim min-w-[240px]'>
                              {teams.map(team => (
                                <SelectItem
                                  key={team.id}
                                  value={team.id}
                                  className='text-mercury focus:bg-vault-floor focus:text-white'
                                >
                                  {team.name} {team.isOwner ? '(Owner)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className='bg-vault-floor/50 border-t border-rim p-6'>
                  <Button
                    className='w-full bg-[#00f0ff]/10 text-[#00f0ff] hover:bg-[#00f0ff]/20 border border-[#00f0ff]/30'
                    onClick={handleStore}
                    disabled={isStoreDisabled}
                  >
                    <Shield className='w-4 h-4 mr-2' />
                    Seal & Store
                  </Button>
                </CardFooter>
              </Card>
            )}

            {storeStatus !== 'idle' && storeStatus !== 'success' && (
              <Card className='bg-steel border-rim shadow-2xl p-8 flex flex-col items-center justify-center min-h-[400px] animate-in zoom-in-95 duration-300'>
                <div className='space-y-8 w-full max-w-sm'>
                  <div
                    className={`flex items-center gap-4 transition-all duration-500 ${storeStatus === 'encrypting' ? 'opacity-100 scale-105' : 'opacity-40'}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border ${storeStatus === 'encrypting' ? 'border-cyan-glow bg-cyan-glow/10 text-cyan-glow shadow-[0_0_15px_rgba(0,240,255,0.3)] animate-pulse' : 'border-rim text-mist'}`}
                    >
                      <Shield className='w-4 h-4' />
                    </div>
                    <div className='flex-1'>
                      <div
                        className={`text-sm font-medium ${storeStatus === 'encrypting' ? 'text-cyan-glow' : 'text-mercury'}`}
                      >
                        Encrypting with Seal
                      </div>
                      <div className='text-xs text-mist font-mono mt-1'>
                        Applying {storePolicy} policy...
                      </div>
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-4 transition-all duration-500 ${storeStatus === 'storing' ? 'opacity-100 scale-105' : 'opacity-40'}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border ${storeStatus === 'storing' ? 'border-mercury bg-mercury/10 text-mercury animate-pulse' : 'border-rim text-mist'}`}
                    >
                      <Database className='w-4 h-4' />
                    </div>
                    <div className='flex-1'>
                      <div
                        className={`text-sm font-medium ${storeStatus === 'storing' ? 'text-mercury' : 'text-mist'}`}
                      >
                        Storing on Walrus
                      </div>
                      <div className='text-xs text-mist font-mono mt-1'>
                        Uploading encrypted blob...
                      </div>
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-4 transition-all duration-500 ${storeStatus === 'writing' ? 'opacity-100 scale-105' : 'opacity-40'}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border ${storeStatus === 'writing' ? 'border-mercury bg-mercury/10 text-mercury animate-pulse' : 'border-rim text-mist'}`}
                    >
                      <LinkIcon className='w-4 h-4' />
                    </div>
                    <div className='flex-1'>
                      <div
                        className={`text-sm font-medium ${storeStatus === 'writing' ? 'text-mercury' : 'text-mist'}`}
                      >
                        Writing to Sui
                      </div>
                      <div className='text-xs text-mist font-mono mt-1'>
                        Creating on-chain reference...
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {storeStatus === 'success' && (
              <Card className='bg-steel border-rim shadow-[0_0_30px_rgba(0,0,0,0.5)] border-t-cyan-glow/50 animate-in fade-in slide-in-from-bottom-8 duration-700'>
                <CardHeader className='text-center pb-2'>
                  <div className='mx-auto w-16 h-16 bg-cyan-glow/10 rounded-full flex items-center justify-center mb-4 border border-cyan-glow/30 shadow-[0_0_15px_rgba(0,240,255,0.2)]'>
                    <CheckCircle2 className='w-8 h-8 text-cyan-glow' />
                  </div>
                  <CardTitle className='text-xl font-medium text-mercury'>
                    Secret Vaulted Successfully
                  </CardTitle>
                  <CardDescription className='text-mist'>
                    Your data is securely encrypted and stored.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4 pt-6'>
                  <div className='p-4 bg-vault-floor rounded-md border border-rim space-y-3'>
                    <div className='flex justify-between items-center'>
                      <span className='text-xs text-mist uppercase'>
                        Walrus Blob ID
                      </span>
                      <span className='text-xs font-mono text-mercury bg-steel px-2 py-1 rounded select-all'>
                        {createdBlobId
                          ? `${createdBlobId.slice(0, 12)}...${createdBlobId.slice(-8)}`
                          : 'walrus_...'}
                      </span>
                    </div>
                    <div className='flex justify-between items-center'>
                      <span className='text-xs text-mist uppercase'>
                        Sui Object ID
                      </span>
                      <span className='text-xs font-mono text-mercury bg-steel px-2 py-1 rounded select-all'>
                        {createdObjectId
                          ? `${createdObjectId.slice(0, 10)}...`
                          : '0x...'}
                      </span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className='pt-2'>
                  <Button
                    className='w-full bg-steel border border-rim text-mercury hover:bg-vault-floor'
                    onClick={resetStore}
                  >
                    Return to Vault
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
