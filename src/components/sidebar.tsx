'use client'

import React, { useState } from 'react'
import { useVault } from './vault-context'
import { Button } from '@/components/ui/button'
import { Lock, Wallet, Users, Plus, Folder, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit'

export function Sidebar() {
  const {
    vaultItems,
    selectedItemId,
    setSelectedItemId,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    addTeam,
  } = useVault()

  const account = useCurrentAccount()
  const router = useRouter()
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction()

  // Modal states
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamMembers, setNewTeamMembers] = useState('')
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)

  // Filter vault items based on selected team
  const filteredItems = vaultItems.filter(item => {
    if (selectedTeamId) {
      return item.allowlistObjectId === selectedTeamId
    }
    return true // Show all if no team is selected
  })

  const handleCreateTeam = async () => {
    if (!newTeamName || !account) return
    setIsCreatingTeam(true)

    const membersList = newTeamMembers
      .split(',')
      .map(m => m.trim())
      .filter(m => m.length > 0)

    try {
      const { createTeam } = await import('@/lib/vaultkey-sdk')
      const signer = {
        toSuiAddress: () => account.address,
        signAndExecuteTransaction: async (args: any) => {
          return await signAndExecuteTransaction({
            transaction: args.transaction,
          })
        },
      }

      const result = await createTeam(newTeamName, membersList, signer)

      addTeam({
        id: result.teamId,
        name: newTeamName,
        owner: account.address,
        memberCount: membersList.length + 1,
        isOwner: true,
        capId: result.capId,
      })

      setShowCreateTeamModal(false)
      setNewTeamName('')
      setNewTeamMembers('')
    } catch (e) {
      console.error('Failed to create team:', e)
    } finally {
      setIsCreatingTeam(false)
    }
  }

  return (
    <div className='w-64 border-r border-rim bg-vault-floor flex flex-col h-screen relative'>
      <Link
        href='/'
        className='p-6 border-b border-rim flex items-center gap-3'
      >
        <Lock className='w-6 h-6 text-mist' />
        <span className='font-bold tracking-widest text-mercury uppercase text-sm'>
          VaultKey
        </span>
      </Link>

      <div className='p-4 border-b border-rim'>
        <div className='text-xs uppercase tracking-wider text-mist mb-3'>
          Wallet State
        </div>
        <div className='flex items-center gap-2 bg-steel p-3 rounded-md border border-rim'>
          <Wallet
            className={`w-4 h-4 ${account ? 'text-cyan-glow' : 'text-mist'}`}
          />
          <span className='text-sm font-mono truncate text-mercury'>
            {account
              ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
              : 'Not Connected'}
          </span>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto p-4 space-y-6'>
        <div className='space-y-1'>
          <button
            onClick={() => {
              setSelectedTeamId(null)
              router.push('/vault')
            }}
            className={`w-full flex items-center gap-2 p-2 rounded text-sm transition-colors ${selectedTeamId === null ? 'bg-steel text-cyan-glow' : 'text-mist hover:text-mercury'}`}
          >
            <Folder className='w-4 h-4' />
            <span>All Secrets</span>
          </button>
        </div>

        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='text-xs uppercase tracking-wider text-mist font-semibold flex items-center gap-2'>
              <Users className='w-3.5 h-3.5' /> TEAMS
            </span>
            <div className='flex gap-1'>
              <button
                onClick={() => setShowCreateTeamModal(true)}
                title='Create Team'
                className='p-1 hover:text-cyan-glow text-mist transition-colors'
              >
                <Plus className='w-3.5 h-3.5' />
              </button>
            </div>
          </div>
          <div className='space-y-1 max-h-[160px] overflow-y-auto pr-1'>
            {teams.map(team => (
              <button
                key={team.id}
                onClick={() => {
                  setSelectedTeamId(team.id)
                  setSelectedItemId(null)
                  router.push('/vault')
                }}
                className={`w-full flex items-center justify-between p-2 rounded text-xs transition-colors ${selectedTeamId === team.id ? 'bg-steel/70 border border-rim text-cyan-glow' : 'border border-transparent text-mist hover:bg-steel/30 hover:text-mercury'}`}
              >
                <span className='truncate pr-2 font-medium'>{team.name}</span>
                <span className='text-[10px] bg-vault-floor border border-rim px-1.5 py-0.5 rounded text-mist shrink-0'>
                  {team.memberCount}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className='space-y-3'>
          <div className='text-xs uppercase tracking-wider text-mist font-semibold flex items-center gap-2'>
            <Lock className='w-3.5 h-3.5' /> SECRETS
          </div>
          <div className='space-y-2 max-h-[220px] overflow-y-auto pr-1'>
            {filteredItems.length === 0 ? (
              <div className='text-[11px] text-mist/60 p-2 border border-dashed border-rim rounded text-center'>
                No secrets found
              </div>
            ) : (
              filteredItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedItemId(item.id)
                    router.push('/vault')
                  }}
                  className={`w-full text-left p-2.5 rounded border transition-colors ${selectedItemId === item.id ? 'bg-steel border-rim text-mercury' : 'border-transparent text-mist hover:bg-steel/50'}`}
                >
                  <div className='text-xs font-semibold truncate'>
                    {item.label}
                  </div>
                  <div className='text-[10px] font-mono opacity-50 mt-0.5 truncate'>
                    {item.objectId}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className='p-4 border-t border-rim flex flex-col gap-3'>
        <Button
          variant='outline'
          className='w-full bg-transparent border-rim text-mercury hover:bg-steel hover:text-white'
          onClick={() => {
            setSelectedItemId(null)
            router.push('/store')
          }}
        >
          <Lock className='w-4 h-4 mr-2' />
          Store New Secret
        </Button>
      </div>

      {showCreateTeamModal && (
        <div className='absolute inset-0 bg-vault-floor/80 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
          <div className='bg-steel border border-rim rounded-xl w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-200'>
            <div className='flex items-center justify-between'>
              <h3 className='font-semibold text-mercury text-sm uppercase tracking-wider flex items-center gap-2'>
                <Users className='w-4 h-4 text-cyan-glow' /> Create Team
              </h3>
              <button
                onClick={() => setShowCreateTeamModal(false)}
                className='text-mist hover:text-mercury'
              >
                <X className='w-4 h-4' />
              </button>
            </div>

            <div className='space-y-3'>
              <div className='space-y-1'>
                <label className='text-[10px] uppercase text-mist tracking-wider'>
                  Team Name
                </label>
                <input
                  type='text'
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder='e.g. Backend Devs'
                  className='w-full bg-vault-floor border border-rim rounded p-2 text-xs text-mercury focus:outline-none focus:border-cyan-glow/50 font-mono'
                />
              </div>
              <div className='space-y-1'>
                <label className='text-[10px] uppercase text-mist tracking-wider'>
                  Initial Members (comma-separated addresses)
                </label>
                <textarea
                  value={newTeamMembers}
                  onChange={e => setNewTeamMembers(e.target.value)}
                  placeholder='0xaddress1, 0xaddress2...'
                  rows={3}
                  className='w-full bg-vault-floor border border-rim rounded p-2 text-xs text-mercury focus:outline-none focus:border-cyan-glow/50 font-mono resize-none'
                />
              </div>
            </div>

            <div className='flex gap-2 pt-2'>
              <Button
                variant='outline'
                onClick={() => setShowCreateTeamModal(false)}
                className='flex-1 bg-transparent border-rim text-mercury'
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTeam}
                disabled={!newTeamName || isCreatingTeam}
                className='flex-1 bg-cyan-glow/10 text-cyan-glow hover:bg-cyan-glow/20 border border-cyan-glow/30'
              >
                {isCreatingTeam ? 'Creating...' : 'Create Team'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
