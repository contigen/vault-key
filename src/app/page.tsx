'use client'

import { useEffect } from 'react'
import { Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'

export default function LandingPage() {
  const account = useCurrentAccount()
  const router = useRouter()

  useEffect(() => {
    if (account) {
      router.push('/vault')
    }
  }, [account, router])

  return (
    <div className='flex flex-col h-screen w-full bg-vault-floor text-mercury overflow-hidden items-center justify-center relative'>
      <div className='absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] pointer-events-none' />

      <div className='max-w-lg w-full px-6 space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 relative z-10 flex flex-col items-center text-center'>
        {/* Logo and Branding */}
        <div className='flex flex-col items-center space-y-6'>
          <div className='w-20 h-20 rounded-3xl bg-steel border border-rim flex items-center justify-center shadow-[0_0_40px_rgba(0,240,255,0.05)]'>
            <Shield className='w-10 h-10 text-cyan-glow opacity-80' />
          </div>
          <div className='space-y-2'>
            <h1 className='text-4xl md:text-5xl font-medium tracking-tight text-mercury'>
              VaultKey
            </h1>
            <p className='text-mist text-lg max-w-[320px] font-light'>
              The high-end credential vault for Web3 developers.
            </p>
          </div>
        </div>

        <div className='flex flex-col items-center space-y-4 pt-4 w-full'>
          <ConnectButton className='bg-steel! border! border-rim! hover:border-cyan-glow/50! text-mercury! hover:text-cyan-glow! h-14! !px-8 rounded-full! font-mono! text-sm! transition-all! shadow-lg!' />

          <p className='text-xs text-mist/60 uppercase tracking-widest font-mono pt-4'>
            Connect wallet to authenticate
          </p>
        </div>
      </div>
    </div>
  )
}
