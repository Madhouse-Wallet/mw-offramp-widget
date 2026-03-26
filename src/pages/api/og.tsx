import { ImageResponse } from '@vercel/og'
import type { NextRequest } from 'next/server'

export const config = { runtime: 'edge' }

export default function handler(_req: NextRequest) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1a0e 50%, #1a1a1a 100%)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(234,88,12,0.25) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
          }}
        />

        {/* MW logo mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {/* Simple MW text logo */}
          <div
            style={{
              fontSize: '52px',
              fontWeight: '900',
              letterSpacing: '-2px',
              display: 'flex',
            }}
          >
            <span style={{ color: '#ffffff' }}>M</span>
            <span style={{ color: '#ea580c' }}>W</span>
          </div>
          <div
            style={{
              width: '2px',
              height: '48px',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
            }}
          />
          <div
            style={{
              fontSize: '18px',
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            Madhouse Wallet
          </div>
        </div>

        {/* Main headline */}
        <div
          style={{
            fontSize: '72px',
            fontWeight: '800',
            color: '#ffffff',
            letterSpacing: '-2px',
            lineHeight: '1.1',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span>Sell Crypto.</span>
          <span style={{ color: '#ea580c' }}>Get Paid Instantly.</span>
        </div>

        {/* Sub-line */}
        <div
          style={{
            marginTop: '24px',
            fontSize: '26px',
            color: 'rgba(255,255,255,0.65)',
            textAlign: 'center',
            maxWidth: '800px',
            lineHeight: '1.4',
            display: 'flex',
          }}
        >
          Convert USDC to 45+ currencies — direct to your bank account
        </div>

        {/* Pills row */}
        <div
          style={{
            marginTop: '40px',
            display: 'flex',
            gap: '12px',
          }}
        >
          {['Base', 'Arbitrum', 'Ethereum', 'Solana', 'Polygon'].map((n) => (
            <div
              key={n}
              style={{
                padding: '8px 20px',
                borderRadius: '999px',
                border: '1px solid rgba(234,88,12,0.5)',
                background: 'rgba(234,88,12,0.12)',
                color: '#fb923c',
                fontSize: '16px',
                fontWeight: '600',
                display: 'flex',
              }}
            >
              {n}
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            fontSize: '18px',
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.05em',
            display: 'flex',
          }}
        >
          sellcoins.now
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
