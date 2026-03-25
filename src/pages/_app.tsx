import type { AppProps } from 'next/app'
import Head from 'next/head'
import '@/styles/globals.css'

const SITE_URL = 'https://sell.madhousewallet.com'
const SITE_NAME = 'Madhouse Wallet — Sell Crypto'
const TITLE = 'Sell Crypto Instantly | Madhouse Wallet Offramp'
const DESCRIPTION =
  'Convert USDC to 45+ local currencies and receive funds directly to your bank account. Fast, secure crypto offramp powered by Madhouse Wallet and Wise.'
const OG_IMAGE = `${SITE_URL}/og-image.png`

export default function App({ Component, pageProps }: AppProps) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
  return (
    <>
      <Head>
        {/* ── Core ───────────────────────────────────────────────────────── */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta
          name="keywords"
          content="crypto offramp, sell USDC, sell crypto, USDC to bank, crypto to cash, stablecoin offramp, Madhouse Wallet, crypto payout, sell stablecoin, Base network, crypto to fiat"
        />
        <meta name="author" content="Madhouse Wallet" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={SITE_URL} />

        {/* ── Favicon & icons ────────────────────────────────────────────── */}
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <meta name="theme-color" content="#ea580c" />
        <link rel="manifest" href="/site.webmanifest" />

        {/* ── Open Graph (Facebook, LinkedIn, WhatsApp, Slack…) ──────────── */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Madhouse Wallet crypto offramp — sell USDC to local currency" />
        <meta property="og:locale" content="en_US" />

        {/* ── Twitter Card ───────────────────────────────────────────────── */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@MadhouseWallet" />
        <meta name="twitter:creator" content="@MadhouseWallet" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta name="twitter:image:alt" content="Madhouse Wallet crypto offramp" />

        {/* ── reCAPTCHA ──────────────────────────────────────────────────── */}
        {siteKey && (
          <script
            src={`https://www.google.com/recaptcha/api.js?render=${siteKey}`}
            async
            defer
          />
        )}
      </Head>
      <Component {...pageProps} />
    </>
  )
}
