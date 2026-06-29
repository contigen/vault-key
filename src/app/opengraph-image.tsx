import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Image metadata
export const alt = 'VaultKey - Decentralized Credential Vault'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  // Load the Host Grotesk font from the fonts directory
  const fontData = await readFile(
    join(process.cwd(), 'src/app/fonts/HostGrotesk-SemiBold.ttf')
  )

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 80px',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'Host Grotesk',
        }}
      >
        {/* Grid pattern background overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(128, 128, 128, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(128, 128, 128, 0.05) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            opacity: 0.8,
          }}
        />

        {/* Ambient center cyan glow */}
        <div
          style={{
            position: 'absolute',
            left: '300px',
            top: '115px',
            width: '600px',
            height: '400px',
            borderRadius: '9999px',
            backgroundImage:
              'radial-gradient(circle, rgba(0, 240, 255, 0.12) 0%, rgba(0, 0, 0, 0) 70%)',
          }}
        />

        {/* Center Container: Brand & Messaging */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {/* Logo container */}
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '28px',
              background: '#171717',
              border: '1px solid #262626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(0, 240, 255, 0.08)',
              marginBottom: '28px',
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00f0ff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.85 }}
            >
              <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6z" />
            </svg>
          </div>

          {/* Title */}
          <span
            style={{
              fontSize: '72px',
              color: '#e5e5e5',
              fontWeight: 'bold',
              letterSpacing: '-0.02em',
              marginBottom: '16px',
            }}
          >
            VaultKey.
          </span>

          {/* Description */}
          <span
            style={{
              fontSize: '26px',
              color: '#a3a3a3',
              lineHeight: '1.4',
              maxWidth: '680px',
              marginBottom: '36px',
              fontWeight: 'normal',
            }}
          >
            The decentralized credential vault for Web3 developers.
          </span>

          {/* Badges */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#00f0ff',
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1px solid rgba(0, 240, 255, 0.2)',
                padding: '6px 16px',
                borderRadius: '20px',
                letterSpacing: '0.12em',
                fontWeight: 'bold',
              }}
            >
              SUI NETWORK
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#a3a3a3',
                background: '#171717',
                border: '1px solid #262626',
                padding: '6px 16px',
                borderRadius: '20px',
                letterSpacing: '0.12em',
                fontWeight: 'bold',
              }}
            >
              WALRUS STORAGE
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#a3a3a3',
                background: '#171717',
                border: '1px solid #262626',
                padding: '6px 16px',
                borderRadius: '20px',
                letterSpacing: '0.12em',
                fontWeight: 'bold',
              }}
            >
              MYSTEN SEAL
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Host Grotesk',
          data: fontData,
          style: 'normal',
          weight: 600,
        },
      ],
    }
  )
}
