'use client'

import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type SecretRevealProps = {
  secret: string
  isRevealing: boolean
  onComplete?: () => void
  className?: string
}

export function SecretReveal({
  secret,
  isRevealing,
  onComplete,
  className,
}: SecretRevealProps) {
  const [revealedChars, setRevealedChars] = useState<number>(0)

  useEffect(() => {
    if (!isRevealing) {
      setRevealedChars(0)
      return
    }

    let current = 0
    const interval = setInterval(() => {
      current++
      setRevealedChars(current)
      if (current >= secret.length) {
        clearInterval(interval)
        if (onComplete) onComplete()
      }
    }, 50) // Reveal one character every 50ms

    return () => clearInterval(interval)
  }, [isRevealing, secret.length, onComplete])

  return (
    <div
      className={cn(
        'relative font-mono text-mercury text-lg inline-block',
        className,
      )}
    >
      <div className='relative z-10 break-all'>
        {secret.split('').map((char, index) => (
          <span
            key={index}
            className={cn(
              'transition-opacity duration-100',
              index < revealedChars ? 'opacity-100' : 'opacity-0',
            )}
          >
            {char}
          </span>
        ))}
      </div>

      {isRevealing && (
        <div className='absolute bottom-0 left-0 h-[2px] bg-cyan-glow animate-laser-sweep z-0 shadow-[0_0_8px_#00f0ff]' />
      )}
    </div>
  )
}
