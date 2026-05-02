import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import type { EthProvider } from '@/types'
import { WalletButton } from '@/components/WalletButton'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!
// ── JSON-LD structured data ───────────────────────────────────────────────────
// Helps Google, Bing, Perplexity, and AI search engines understand the page.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#webapp`,
      name: 'Madhouse Wallet Crypto Offramp',
      url: SITE_URL,
      description:
        'Convert USDC to 82 local currencies and receive funds directly to your bank account. Fast, secure crypto offramp powered by Madhouse Wallet.',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'No subscription fee. Small network and transfer fees apply per transaction.',
      },
      featureList: [
        'USDC to 82 currencies',
        'Base, Arbitrum, Ethereum, Optimism, Polygon, Solana networks',
        'Real-time exchange rate quotes',
        'No account registration required',
      ],
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: 'Madhouse Wallet',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/mw.png`,
      },
      sameAs: [
        'https://twitter.com/MadhouseWallet',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        availableLanguage: 'English',
        url: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL ?? 'https://wa.me/14847739576',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How do I sell USDC and receive local currency?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Enter the USD amount you want to convert, choose your recipient currency, enter your bank account details, then send USDC to the deposit address shown. Madhouse Wallet converts it and sends the local currency to your bank account.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which cryptocurrencies and networks are supported?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Currently USDC is supported on Base, Arbitrum, Ethereum, Optimism, Polygon, and Solana networks.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which currencies can I receive?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Over 45 currencies including USD, EUR, GBP, NGN, KES, GHS, INR, BRL, MXN, PHP, and many more.',
          },
        },
        {
          '@type': 'Question',
          name: 'How long does the transfer take?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Once your USDC deposit is detected on-chain, bank transfers typically complete within a few hours.',
          },
        },
        {
          '@type': 'Question',
          name: 'What are the fees?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'A fee applies, and the exact amounts are shown before you confirm.',
          },
        },
      ],
    },
  ],
}

// The widget uses Web Crypto (jose) and browser-only APIs — disable SSR to
// prevent hydration mismatches.
const OfframpWidget = dynamic(
  () => import('@/components/OfframpWidget').then((m) => m.OfframpWidget),
  { ssr: false },
)

function SupportButton() {
  const [hovered, setHovered] = useState(false)
  const supportLink = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL ?? 'https://wa.me/14847739576'
  return (
    /* Fixed FAB bottom-right on all screen sizes */
    <div className="flex fixed bottom-0 sm:bottom-6 right-4 sm:right-6 z-50 items-center gap-2 pb-2 sm:pb-0">
      <span
        className={[
          'whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow pointer-events-none transition-all duration-200',
          hovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2',
        ].join(' ')}
      >
        Chat with Support
      </span>
      <a
        href={supportLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with Support"
        onMouseDown={(e) => e.currentTarget.blur()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-[#fd754d] shadow-lg transition-colors duration-200 hover:bg-[#e85e37] focus:outline-none"
        style={{ textDecoration: 'none' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true">
          <path fill="white" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
          <circle cx="18.5" cy="5.5" r="4.5" fill="white"/>
          <text x="18.5" y="8.8" textAnchor="middle" fontSize="7.5" fontWeight="bold" fill="#fd754d">?</text>
        </svg>
      </a>
    </div>
  )
}

function RecaptchaBadge() {
  if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) return null
  const badge = (
    <div className="flex items-center gap-1 rounded bg-white/80 px-2 py-1 shadow-sm backdrop-blur-sm">
      <svg width="14" height="14" viewBox="0 0 64 64" aria-hidden="true">
        <path fill="#4A90D9" d="M32 0C14.3 0 0 14.3 0 32s14.3 32 32 32 32-14.3 32-32S49.7 0 32 0z"/>
        <path fill="#fff" d="M32 10c-12.1 0-22 9.9-22 22s9.9 22 22 22 22-9.9 22-22-9.9-22-22-22zm0 38c-8.8 0-16-7.2-16-16s7.2-16 16-16 16 7.2 16 16-7.2 16-16 16z"/>
        <path fill="#4A90D9" d="M32 22c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10-4.5-10-10-10z"/>
      </svg>
      <span className="text-[10px] leading-none text-gray-500">
        reCAPTCHA{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy</a>
        {' · '}
        <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a>
      </span>
    </div>
  )
  return (
    <>
      {/* Mobile: inline below widget */}
      <div className="sm:hidden mt-3 w-full max-w-md flex justify-center">
        {badge}
      </div>
      {/* Desktop: fixed bottom-left */}
      <div className="hidden sm:block fixed bottom-4 left-4 z-50">
        {badge}
      </div>
    </>
  )
}

// ── Supported countries ticker ────────────────────────────────────────────────
const TICKER_ITEMS = [
  { flag: '��', label: 'USA' },
  { flag: '��', label: 'UK' },
  { flag: '�', label: 'Europe' },
  { flag: '��', label: 'Nigeria' },
  { flag: '🇭', label: 'Ghana' },
  { flag: '��', label: 'Kenya' },
  { flag: '��', label: 'South Africa' },
  { flag: '��', label: 'India' },
  { flag: '🇧🇷', label: 'Brazil' },
  { flag: '��', label: 'Mexico' },
  { flag: '🇨🇦', label: 'Canada' },
  { flag: '��', label: 'Australia' },
  { flag: '��', label: 'Singapore' },
  { flag: '��', label: 'Philippines' },
  { flag: '��', label: 'Pakistan' },
  { flag: '��', label: 'Bangladesh' },
  { flag: '��', label: 'Indonesia' },
  { flag: '��', label: 'Malaysia' },
  { flag: '��', label: 'Japan' },
  { flag: '��', label: 'South Korea' },
  { flag: '�🇳', label: 'China' },
  { flag: '🇭🇰', label: 'Hong Kong' },
  { flag: '🇨🇭', label: 'Switzerland' },
  { flag: '��', label: 'Norway' },
  { flag: '��', label: 'Sweden' },
  { flag: '��', label: 'Denmark' },
  { flag: '🇵🇱', label: 'Poland' },
  { flag: '��', label: 'Czech Republic' },
  { flag: '��', label: 'Romania' },
  { flag: '��', label: 'Ukraine' },
  { flag: '��', label: 'Turkey' },
  { flag: '��', label: 'Egypt' },
  { flag: '🇲🇦', label: 'Morocco' },
  { flag: '��', label: 'Tanzania' },
  { flag: '��', label: 'Uganda' },
  { flag: '��', label: 'Rwanda' },
  { flag: '��', label: 'Saudi Arabia' },
  { flag: '��', label: 'UAE' },
  { flag: '��', label: 'Qatar' },
  { flag: '��', label: 'Kuwait' },
  { flag: '🇳', label: 'New Zealand' },
  { flag: '��', label: 'Colombia' },
  { flag: '🇵🇪', label: 'Peru' },
  { flag: '��', label: 'Chile' },
  { flag: '��', label: 'Argentina' },
  { flag: '��', label: 'Thailand' },
  { flag: '��', label: 'Vietnam' },
  { flag: '��', label: 'Sri Lanka' },
  { flag: '��', label: 'Nepal' },
  { flag: '��', label: 'Israel' },
  { flag: '��', label: 'Georgia' },
  { flag: '�🇳', label: 'Tunisia' },  { flag: '🇦🇱', label: 'Albania' },
  { flag: '🇧🇦', label: 'Bosnia-Herzegovina' },
  { flag: '🇧🇬', label: 'Bulgaria' },
  { flag: '🇧🇭', label: 'Bahrain' },
  { flag: '🇧🇲', label: 'Bermuda' },
  { flag: '🇧🇴', label: 'Bolivia' },
  { flag: '🇧🇼', label: 'Botswana' },
  { flag: '🇨🇷', label: 'Costa Rica' },
  { flag: '🇨🇻', label: 'Cape Verde' },
  { flag: '🇩🇴', label: 'Dominican Republic' },
  { flag: '🇬🇲', label: 'Gambia' },
  { flag: '🇬🇳', label: 'Guinea' },
  { flag: '🇬🇹', label: 'Guatemala' },
  { flag: '🇭🇳', label: 'Honduras' },
  { flag: '🇭🇺', label: 'Hungary' },
  { flag: '🇮🇸', label: 'Iceland' },
  { flag: '🇰🇬', label: 'Kyrgyzstan' },
  { flag: '🇰🇭', label: 'Cambodia' },
  { flag: '🇱🇦', label: 'Laos' },
  { flag: '🇲🇳', label: 'Mongolia' },
  { flag: '🇲🇴', label: 'Macau' },
  { flag: '🇲🇺', label: 'Mauritius' },
  { flag: '🇳🇦', label: 'Namibia' },
  { flag: '🇳🇮', label: 'Nicaragua' },
  { flag: '🇴🇲', label: 'Oman' },
  { flag: '🇵🇾', label: 'Paraguay' },
  { flag: '🇷🇸', label: 'Serbia' },
  { flag: '🇸🇨', label: 'Seychelles' },
  { flag: '🇸🇷', label: 'Suriname' },
  { flag: '🇺🇾', label: 'Uruguay' },]

function CountryTicker({ isDark }: { isDark: boolean }) {
  const firstCopyRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // Measure exact pixel width of one copy and set it as a CSS variable so the
  // animation translates by precisely that amount — eliminating the reset jump
  // caused by sub-pixel rounding when using translateX(-50%).
  useEffect(() => {
    if (!firstCopyRef.current || !stripRef.current) return
    const observer = new ResizeObserver(() => {
      if (firstCopyRef.current && stripRef.current) {
        const w = firstCopyRef.current.getBoundingClientRect().width
        stripRef.current.style.setProperty('--ticker-copy-width', `${w}px`)
      }
    })
    observer.observe(firstCopyRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="w-full overflow-hidden bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl backdrop-saturate-150 py-3 sm:py-5"
      style={{
        boxShadow: isDark
          ? 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(255,255,255,0.06), 0 1px 8px rgba(0,0,0,0.35)'
          : 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(255,255,255,0.4), 0 1px 8px rgba(0,0,0,0.08)',
      }}
    >
      <div ref={stripRef} className="flex animate-ticker gap-0">
        {/* First copy — measured */}
        <div ref={firstCopyRef} className="flex shrink-0">
          {TICKER_ITEMS.map((item, i) => (
            <div key={i} className="flex shrink-0 items-center px-4 sm:px-8">
              <span className="whitespace-nowrap text-base sm:text-2xl md:text-4xl font-semibold text-gray-700 dark:text-gray-300">{item.label}</span>
              <span className="ml-4 sm:ml-8 text-base sm:text-2xl md:text-4xl text-gray-300 dark:text-gray-700" aria-hidden="true">·</span>
            </div>
          ))}
        </div>
        {/* Second copy — identical, fills the gap as first scrolls off */}
        <div className="flex shrink-0" aria-hidden="true">
          {TICKER_ITEMS.map((item, i) => (
            <div key={i} className="flex shrink-0 items-center px-4 sm:px-8">
              <span className="whitespace-nowrap text-base sm:text-2xl md:text-4xl font-semibold text-gray-700 dark:text-gray-300">{item.label}</span>
              <span className="ml-4 sm:ml-8 text-base sm:text-2xl md:text-4xl text-gray-300 dark:text-gray-700">·</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [evmAddress, setEvmAddress] = useState<string | null>(null)
  const [evmProvider, setEvmProvider] = useState<EthProvider | null>(null)
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mw-theme')
    const prefersDark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDark(prefersDark)
    document.documentElement.classList.toggle('dark', prefersDark)
  }, [])

  function toggleDark() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('mw-theme', next ? 'dark' : 'light')
  }

  function handleEvmConnect(address: string, provider: EthProvider) {
    setEvmAddress(address)
    setEvmProvider(provider)
  }

  function handleEvmDisconnect() {
    setEvmAddress(null)
    setEvmProvider(null)
  }

  return (
    <>
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
        {/* ── Navbar ── */}
        <header
          className="sticky top-0 z-40 bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl backdrop-saturate-150"
          style={{
            boxShadow: isDark
              ? 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(255,255,255,0.06), 0 1px 8px rgba(0,0,0,0.35)'
              : 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(255,255,255,0.4), 0 1px 8px rgba(0,0,0,0.08)',
          }}
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
            {/* Logo + brand */}
            <div className="flex items-center gap-2.5">
              <img src="/mw.png" alt="Madhouse Wallet" className="h-[41px] w-[41px] sm:h-[46px] sm:w-[46px] rounded-lg object-contain" />
              <div>
                <span className="block text-xs sm:text-sm font-bold text-gray-900 dark:text-white leading-tight">Madhouse Wallet</span>
                <span className="block text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 leading-tight tracking-wide uppercase">Crypto Offramp</span>
              </div>
            </div>

            {/* Dark mode toggle + wallet connect button */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Skeuomorphic toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isDark}
                onClick={toggleDark}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{
                  width: '46px',
                  height: '25px',
                  borderRadius: '13px',
                  padding: '3px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  outline: 'none',
                  flexShrink: 0,
                  transition: 'background 0.35s cubic-bezier(.4,0,.2,1), box-shadow 0.2s',
                  background: isDark
                    ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%)'
                    : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #fde68a 100%)',
                  boxShadow: isDark
                    ? 'inset 0 1px 3px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.4), 0 1px 6px rgba(99,102,241,0.25)'
                    : 'inset 0 1px 3px rgba(0,0,0,0.15), 0 0 0 1px rgba(251,191,36,0.5), 0 1px 6px rgba(251,191,36,0.35)',
                }}
                className="focus-visible:ring-2 focus-visible:ring-[#fa4536] focus-visible:ring-offset-2"
              >
                {/* Stars shown in dark mode */}
                <span aria-hidden="true" style={{
                  position: 'absolute', inset: 0, borderRadius: '15px',
                  overflow: 'hidden', pointerEvents: 'none',
                  opacity: isDark ? 1 : 0,
                  transition: 'opacity 0.3s',
                }}>
                  {[
                    { top: '4px',  left: '7px',  size: '2px' },
                    { top: '8px',  left: '13px', size: '1.5px' },
                    { top: '14px', left: '9px',  size: '1px' },
                    { top: '6px',  left: '18px', size: '1px' },
                    { top: '17px', left: '15px', size: '1.5px' },
                  ].map((s, i) => (
                    <span key={i} style={{
                      position: 'absolute', top: s.top, left: s.left,
                      width: s.size, height: s.size, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.8)',
                    }} />
                  ))}
                </span>

                {/* Knob */}
                <span aria-hidden="true" style={{
                  position: 'absolute',
                  top: '3px',
                  left: isDark ? 'calc(100% - 22px)' : '3px',
                  width: '19px',
                  height: '19px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'left 0.35s cubic-bezier(.4,0,.2,1), background 0.35s, box-shadow 0.35s',
                  background: isDark
                    ? 'radial-gradient(circle at 35% 35%, #fef9c3, #fde047 60%, #eab308)'
                    : 'radial-gradient(circle at 35% 35%, #fff7ed, #fef3c7 60%, #fbbf24)',
                  boxShadow: isDark
                    ? '0 1px 4px rgba(0,0,0,0.5), 0 0 0 1px rgba(234,179,8,0.3), 0 0 8px 2px rgba(253,224,71,0.4)'
                    : '0 1px 4px rgba(0,0,0,0.2), 0 0 0 1px rgba(251,191,36,0.3)',
                }}>
                  {isDark ? (
                    /* Crescent moon — yellow on dark bg */
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                        fill="#713f12"
                        stroke="none"
                      />
                    </svg>
                  ) : (
                    /* Sun — dark amber on yellow knob */
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="4.5" fill="#92400e" />
                      {[0,45,90,135,180,225,270,315].map((deg) => (
                        <line
                          key={deg}
                          x1={12 + 6.5 * Math.cos((deg * Math.PI) / 180)}
                          y1={12 + 6.5 * Math.sin((deg * Math.PI) / 180)}
                          x2={12 + 9.5 * Math.cos((deg * Math.PI) / 180)}
                          y2={12 + 9.5 * Math.sin((deg * Math.PI) / 180)}
                          stroke="#92400e"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      ))}
                    </svg>
                  )}
                </span>
              </button>
              <WalletButton
              evmAddress={evmAddress}
              solanaAddress={solanaAddress}
              onEvmConnect={handleEvmConnect}
              onEvmDisconnect={handleEvmDisconnect}
              onSolanaConnect={setSolanaAddress}
              onSolanaDisconnect={() => setSolanaAddress(null)}
              onOpenChange={setWalletDropdownOpen}
            />
            </div>
          </div>
        </header>

        {/* ── Main content ── */}
        <main
          className={[
            'flex flex-1 flex-col items-center px-3 py-4 sm:px-4 sm:py-10 transition-[filter] duration-200',
            walletDropdownOpen ? 'blur-sm pointer-events-none select-none' : '',
          ].join(' ')}
        >
          {/* Hero text */}
          <div className="mb-5 sm:mb-8 text-center max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#ef5200]/30 bg-[#ef5200]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[#ef5200]">
              Instant crypto offramp
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl md:text-5xl leading-[1.15]">
              Convert{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #ef5200 0%, #fe8714 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                USDC
              </span>{' '}
              to local currency
            </h1>
                        
            {/* Trust badges */}
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <span className="flex items-center gap-1.5 rounded-full bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">
                <span className="text-[#fe8714]">●</span> 82 currencies
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">
                <span className="text-[#fe8714]">●</span> 6 networks
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">
                <span className="text-[#fe8714]">●</span> No registration
              </span>
            </div>
          </div>

          {/* Countries ticker — full width, above widget */}
          <div className="w-full mb-6">
            <p className="mb-2 sm:mb-4 text-center text-[10px] sm:text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Payout destinations</p>
            <CountryTicker isDark={isDark} />
          </div>

          {/* Widget */}
          <OfframpWidget
            connectedEvmAddress={evmAddress ?? undefined}
            connectedSolanaAddress={solanaAddress ?? undefined}
            evmProvider={evmProvider ?? undefined}
            onSuccess={(transferId) => { console.log('Transfer complete:', transferId) }}
            onError={(err) => { console.error('Widget error:', err) }}
          />

        </main>

        <SupportButton />
        <RecaptchaBadge />
      </div>
    </>
  )
}