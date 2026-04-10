/**
 * WalletConnect — self-contained wallet connection UI.
 *
 * Architecture:
 *  - EVM wallets: wagmi v2 (injected, coinbaseWallet, walletConnect connectors)
 *  - Solana wallets: direct native provider access (window.phantom.solana, window.solflare)
 *    bypassing @solana/wallet-adapter readyState checks entirely
 *
 * Single source of truth: `activeWallet` derived state (reconciles wagmi + Solana state).
 *
 * Key invariants:
 *  - `connectingId` is guarded by a ref so stale finally-blocks from cancelled
 *    attempts can never clear a new attempt's loading state (race-condition-safe).
 *  - EVM and Solana state are never mixed: connecting to Solana disconnects wagmi first,
 *    and vice versa.
 *  - wagmi's auto-reconnect is allowed but subordinate to `walletType` context:
 *    if `walletType` is 'solana', the EVM useEffect is suppressed.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useConnect, useDisconnect, useAccount, useChainId, useSwitchChain } from 'wagmi'
import { useWalletType } from '../WalletProvider'
import {
  CHAIN_ID_TO_LABEL,
  CHAIN_ID_TO_COLOR,
  CHAIN_ID_TO_NETWORK,
  SUPPORTED_EVM_CHAINS,
} from '../../lib/wallet-config'

// ─── Types ────────────────────────────────────────────────────────────────────

type SolanaProvider = {
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58: () => string } }>
  disconnect?: () => Promise<void>
  publicKey?: { toBase58: () => string } | null
  isConnected?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortenAddress(addr: string): string {
  if (addr.length <= 13) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * Extracts a human-readable message from an unknown error.
 * Returns null for user-initiated rejections (code 4001, "rejected", "denied",
 * "user closed", "cancelled") so we don't show noise for expected user actions.
 */
function extractErrorMessage(err: unknown): string | null {
  if (!err) return null
  if (typeof err === 'string') return err || null
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    const msg = typeof e.message === 'string' ? e.message : ''
    const code = typeof e.code === 'number' ? e.code : null
    const msgLower = msg.toLowerCase()
    if (
      code === 4001 ||
      msgLower.includes('rejected') ||
      msgLower.includes('denied') ||
      msgLower.includes('user closed') ||
      msgLower.includes('cancelled') ||
      msgLower.includes('user rejected')
    ) {
      return null // Silent — user intentionally cancelled
    }
    if (msg) return msg
    try { return JSON.stringify(err) } catch { return 'Unknown error' }
  }
  return String(err)
}

// ─── Chain badge ──────────────────────────────────────────────────────────────

function ChainBadge({ chainId }: { chainId: number }) {
  const label = CHAIN_ID_TO_LABEL[chainId] ?? `Chain ${chainId}`
  const color = CHAIN_ID_TO_COLOR[chainId] ?? '#6b7280'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      <ChainIcon chainId={chainId} size={10} />
      {label}
    </span>
  )
}

// ─── Chain icon ───────────────────────────────────────────────────────────────

function ChainIcon({ chainId, size = 16 }: { chainId: number; size?: number }) {
  if (chainId === 1) {
    // Ethereum diamond
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 2L6 17l10 6 10-6L16 2z" fill="currentColor" opacity=".6" />
        <path d="M16 25l-10-6 10 14 10-14-10 6z" fill="currentColor" />
      </svg>
    )
  }
  if (chainId === 8453) {
    // Base circle
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="currentColor" opacity=".2" />
        <circle cx="16" cy="16" r="8" fill="currentColor" />
      </svg>
    )
  }
  if (chainId === 137) {
    // Polygon
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M22 10l-6-3.5L10 10v7l6 3.5 6-3.5V10z" fill="currentColor" />
        <path d="M10 10L4 13.5v7L10 24l6-3.5V13.5L10 10z" fill="currentColor" opacity=".5" />
        <path d="M22 10l6 3.5v7L22 24l-6-3.5V13.5L22 10z" fill="currentColor" opacity=".7" />
      </svg>
    )
  }
  if (chainId === 42161) {
    // Arbitrum — stylised orbit
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" opacity=".4" />
        <path d="M10 22l6-12 6 12M12.5 18h7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (chainId === 43114) {
    // Avalanche — A shape
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 5L4 27h7.5l4.5-8 4.5 8H28L16 5z" fill="currentColor" opacity=".7" />
        <path d="M11 21h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".5" />
      </svg>
    )
  }
  // Solana
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 22h17l3-3H9L6 22zM6 13h17l3-3H9L6 13zM26 17H9L6 20h17l3-3z" fill="currentColor" />
    </svg>
  )
}

// ─── Wallet option button ─────────────────────────────────────────────────────

interface WalletOptionProps {
  name: string
  icon: React.ReactNode
  onClick: () => void
  connecting?: boolean
  disabled?: boolean
  subtitle?: string
}

function WalletOption({ name, icon, onClick, connecting, disabled, subtitle }: WalletOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || connecting}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-all hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900">{name}</span>
        {subtitle && <span className="block text-xs text-gray-400 truncate">{subtitle}</span>}
      </span>
      {connecting && (
        <svg className="h-4 w-4 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
    </button>
  )
}

// ─── Wallet icons ─────────────────────────────────────────────────────────────

function BrowserWalletIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Browser wallet">
      <rect width="24" height="24" rx="6" fill="#f3f4f6"/>
      <path d="M9.5 4a1.5 1.5 0 00-1.5 1.5v1H6.5A2.5 2.5 0 004 9v8.5A2.5 2.5 0 006.5 20h11a2.5 2.5 0 002.5-2.5V9a2.5 2.5 0 00-2.5-2.5H16v-1A1.5 1.5 0 0014.5 4h-5zm0 1.5h5V6.5H9.5V5.5zM6.5 8h11A1 1 0 0118.5 9v1.5h-13V9A1 1 0 016.5 8zm-1 3h13v6.5A1 1 0 0117.5 18.5h-11A1 1 0 015.5 17.5V11zm8 2.5a1 1 0 100 2 1 1 0 000-2z" fill="#6b7280"/>
    </svg>
  )
}

function CoinbaseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-label="Coinbase Wallet">
      <circle cx="16" cy="16" r="16" fill="#0052FF"/>
      <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 15.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11z" fill="white"/>
      <rect x="13" y="13" width="6" height="6" rx="1" fill="white"/>
    </svg>
  )
}

function WalletConnectIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-label="WalletConnect">
      <circle cx="16" cy="16" r="16" fill="#3B99FC"/>
      <path d="M9.6 12.8c3.5-3.5 9.3-3.5 12.8 0l.4.4c.2.2.2.5 0 .7l-1.4 1.4c-.1.1-.3.1-.4 0l-.6-.6c-2.4-2.4-6.4-2.4-8.8 0l-.6.6c-.1.1-.3.1-.4 0L9.2 13.9c-.2-.2-.2-.5 0-.7l.4-.4zm15.8 2.9l1.2 1.2c.2.2.2.5 0 .7l-5.5 5.5c-.2.2-.5.2-.7 0l-3.9-3.9c-.1-.1-.2-.1-.4 0l-3.9 3.9c-.2.2-.5.2-.7 0L5.4 17.6c-.2-.2-.2-.5 0-.7l1.2-1.2c.2-.2.5-.2.7 0l3.9 3.9c.1.1.2.1.4 0l3.9-3.9c.2-.2.5-.2.7 0l3.9 3.9c.1.1.2.1.4 0l3.9-3.9c.2-.1.5-.1.7.1z" fill="white"/>
    </svg>
  )
}

function PhantomIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 128 128" fill="none" aria-label="Phantom">
      <rect width="128" height="128" rx="24" fill="#AB9FF2"/>
      <path d="M110.584 64.115c0-25.737-20.586-46.588-45.988-46.588H45.411C23.062 17.527 5 35.791 5 58.39c0 11.946 4.888 22.739 12.762 30.495.483.47.965.938 1.46 1.393l.155.144c6.437 5.843 12.617 8.051 18.74 8.051 6.1 0 8.882-2.736 9.993-4.167 1.111 1.431 3.893 4.167 9.994 4.167 9.208 0 14.52-6.33 14.52-14.52v-5.46c4.93.853 9.5.853 9.5.853 21.15 0 38.46-17.22 38.46-15.231z" fill="url(#phantom-gradient)"/>
      <defs>
        <linearGradient id="phantom-gradient" x1="5" y1="17.527" x2="110.584" y2="110.124" gradientUnits="userSpaceOnUse">
          <stop stopColor="#534BB1"/>
          <stop offset="1" stopColor="#551BF9"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function SolflareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 128 128" fill="none" aria-label="Solflare">
      <rect width="128" height="128" rx="24" fill="#FC8705"/>
      <path d="M97.5 64L64 30.5 30.5 64 64 97.5 97.5 64z" fill="white" opacity=".9"/>
      <path d="M64 44L44 64l20 20 20-20-20-20z" fill="#FC8705"/>
    </svg>
  )
}

// ─── Wallet detection ─────────────────────────────────────────────────────────
// Detects all injected EVM providers (including multi-wallet coexistence via
// window.ethereum.providers array) and Solana providers.

type EthProvider = Record<string, unknown>

interface DetectedEvmWallet {
  /** Stable key used as connectingId (e.g. 'metamask', 'rabby', 'injected-0') */
  key: string
  name: string
  /** The actual provider object — set as window.ethereum before calling wagmi injected() */
  provider: EthProvider
  icon: React.ReactNode
}

interface DetectedWallets {
  evmWallets: DetectedEvmWallet[]
  hasPhantomSolana: boolean
  hasSolflare: boolean
}

/** Maps a provider's flag properties to a wallet name + icon key */
function identifyProvider(p: EthProvider): { name: string; iconKey: string } {
  if (p.isRabby)        return { name: 'Rabby',           iconKey: 'rabby' }
  if (p.isZerion)       return { name: 'Zerion',          iconKey: 'zerion' }
  if (p.isBraveWallet)  return { name: 'Brave Wallet',    iconKey: 'brave' }
  if (p.isPhantom)      return { name: 'Phantom',         iconKey: 'phantom' }
  if (p.isOkxWallet || (p as Record<string,unknown>).isOKExWallet)
                        return { name: 'OKX Wallet',      iconKey: 'okx' }
  if (p.isCoinbaseWallet) return { name: 'Coinbase',      iconKey: 'coinbase-ext' }
  if (p.isFrame)        return { name: 'Frame',           iconKey: 'frame' }
  if (p.isTrust)        return { name: 'Trust Wallet',    iconKey: 'trust' }
  if (p.isTokenPocket)  return { name: 'TokenPocket',     iconKey: 'generic' }
  if (p.isImToken)      return { name: 'imToken',         iconKey: 'generic' }
  if (p.isMetaMask)     return { name: 'MetaMask',        iconKey: 'metamask' }
  return { name: 'Browser Wallet', iconKey: 'generic' }
}

function useWalletDetection(): DetectedWallets {
  const [detected, setDetected] = useState<DetectedWallets>({
    evmWallets: [],
    hasPhantomSolana: false,
    hasSolflare: false,
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      const win = window as unknown as Record<string, unknown>
      const eth = win.ethereum as EthProvider | undefined

      const evmWallets: DetectedEvmWallet[] = []

      if (eth) {
        // Multi-wallet coexistence: some extensions expose all providers in an array
        const providers = (eth.providers as EthProvider[] | undefined) ?? [eth]
        const seen = new Set<string>()

        providers.forEach((p, i) => {
          const { name, iconKey } = identifyProvider(p)
          // Deduplicate by name in case providers array and primary overlap
          if (seen.has(name)) return
          seen.add(name)
          evmWallets.push({
            key: `injected-${iconKey}-${i}`,
            name,
            provider: p,
            icon: getWalletIcon(iconKey),
          })
        })
      }

      const phantom = win.phantom as Record<string, unknown> | undefined
      const hasPhantomSolana =
        !!(phantom?.solana) ||
        !!((win.solana as Record<string, unknown> | undefined)?.isPhantom)
      const hasSolflare = !!((win.solflare as Record<string, unknown> | undefined)?.isSolflare)

      setDetected({ evmWallets, hasPhantomSolana, hasSolflare })
    }, 150)
    return () => clearTimeout(timer)
  }, [])

  return detected
}

// ─── Per-wallet icons ─────────────────────────────────────────────────────────

function getWalletIcon(key: string): React.ReactNode {
  switch (key) {
    case 'metamask':    return <MetaMaskIcon />
    case 'phantom':     return <PhantomIcon />
    case 'rabby':       return <RabbyIcon />
    case 'zerion':      return <ZerionIcon />
    case 'brave':       return <BraveIcon />
    case 'okx':         return <OKXIcon />
    case 'coinbase-ext':return <CoinbaseIcon />
    case 'frame':       return <FrameIcon />
    case 'trust':       return <TrustIcon />
    default:            return <BrowserWalletIcon />
  }
}

function MetaMaskIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 35 33" fill="none" aria-label="MetaMask">
      <path d="M32.958 1L19.37 10.807l2.519-5.938L32.958 1z" fill="#E17726" stroke="#E17726" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.044 1l13.467 9.9-2.398-5.93L2.044 1z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M28.226 23.533l-3.615 5.533 7.739 2.131 2.22-7.54-6.344-.124z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M.435 23.657l2.207 7.54 7.726-2.13-3.603-5.534-6.33.124z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.953 14.412l-2.153 3.254 7.672.35-.264-8.248-5.255 4.644z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M25.048 14.412l-5.323-4.74-.173 8.344 7.659-.35-2.163-3.254z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.368 29.066l4.614-2.24-3.98-3.104-.634 5.344z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21.02 26.826l4.601 2.24-.621-5.344-3.98 3.104z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function RabbyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 40 40" fill="none" aria-label="Rabby">
      <rect width="40" height="40" rx="10" fill="#8697FF"/>
      <path d="M20 8c-6.627 0-12 5.373-12 12 0 3.866 1.836 7.31 4.697 9.554C13.99 31.026 16.855 32 20 32s6.01-.974 7.303-2.446C30.164 27.31 32 23.866 32 20c0-6.627-5.373-12-12-12z" fill="white" opacity=".15"/>
      <ellipse cx="15" cy="19" rx="3.5" ry="4" fill="white"/>
      <ellipse cx="25" cy="19" rx="3.5" ry="4" fill="white"/>
      <circle cx="15" cy="19.5" r="1.5" fill="#8697FF"/>
      <circle cx="25" cy="19.5" r="1.5" fill="#8697FF"/>
      <path d="M17 25c0 0 1.5 2 3 2s3-2 3-2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function ZerionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 40 40" fill="none" aria-label="Zerion">
      <rect width="40" height="40" rx="10" fill="#2962EF"/>
      <path d="M10 28l14-16h6L16 28H10z" fill="white"/>
      <path d="M10 12h16v4H10z" fill="white"/>
    </svg>
  )
}

function BraveIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 40 40" fill="none" aria-label="Brave Wallet">
      <rect width="40" height="40" rx="10" fill="#FB542B"/>
      <path d="M20 8l10 5-2 12-8 7-8-7-2-12 10-5z" fill="white" opacity=".2"/>
      <path d="M20 10l8.5 4.25-1.7 10.2L20 30l-6.8-5.55-1.7-10.2L20 10z" fill="white"/>
      <path d="M20 14l4 8h-8l4-8z" fill="#FB542B"/>
    </svg>
  )
}

function OKXIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 40 40" fill="none" aria-label="OKX Wallet">
      <rect width="40" height="40" rx="10" fill="#000"/>
      <rect x="10" y="10" width="8" height="8" rx="1" fill="white"/>
      <rect x="22" y="10" width="8" height="8" rx="1" fill="white"/>
      <rect x="10" y="22" width="8" height="8" rx="1" fill="white"/>
      <rect x="22" y="22" width="8" height="8" rx="1" fill="white"/>
    </svg>
  )
}

function FrameIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 40 40" fill="none" aria-label="Frame">
      <rect width="40" height="40" rx="10" fill="#111"/>
      <rect x="10" y="10" width="20" height="20" rx="3" stroke="white" strokeWidth="2" fill="none"/>
      <rect x="15" y="15" width="10" height="10" rx="1.5" fill="white"/>
    </svg>
  )
}

function TrustIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 40 40" fill="none" aria-label="Trust Wallet">
      <rect width="40" height="40" rx="10" fill="#3375BB"/>
      <path d="M20 9l10 4v8c0 5-4 9-10 11C14 30 10 26 10 21v-8l10-4z" fill="white" opacity=".9"/>
      <path d="M17 20l2.5 2.5L24 17" stroke="#3375BB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  onClose: () => void
  onEvmConnect: (connectorId: string, provider?: EthProvider) => void
  onSolanaConnect: (walletKey: 'phantom' | 'solflare') => void
  connectingId: string | null
  error: string | null
  evmWallets: DetectedEvmWallet[]
  hasPhantomSolana: boolean
  hasSolflare: boolean
}

function WalletModal({
  onClose, onEvmConnect, onSolanaConnect, connectingId, error,
  evmWallets, hasPhantomSolana, hasSolflare,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    const el = modalRef.current
    if (!el) return
    const focusable = el.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusable[0]?.focus()
  }, [])

  const busy = connectingId !== null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={modalRef}
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200 animate-in slide-in-from-bottom-4 duration-200 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <h2 id="wallet-modal-title" className="text-base font-semibold text-gray-900">
            Connect Wallet
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Error banner */}
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-red-700 mb-0.5">Connection error</p>
              <p className="font-mono text-xs text-red-600 break-all">{error}</p>
            </div>
          )}

          {/* Detected browser wallets (EVM) */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Browser Wallets · EVM
            </p>
            <div className="space-y-2">
              {evmWallets.length > 0 ? (
                evmWallets.map((w) => (
                  <WalletOption
                    key={w.key}
                    name={w.name}
                    icon={w.icon}
                    onClick={() => onEvmConnect(w.key, w.provider)}
                    connecting={connectingId === w.key}
                    disabled={busy && connectingId !== w.key}
                    subtitle={w.name === 'Phantom' ? 'Connect on Ethereum, Base, Polygon, Arbitrum, or Avalanche' : undefined}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-xs text-gray-400">
                  No browser wallet detected. Install MetaMask, Rabby, or another EVM wallet extension.
                </div>
              )}

              {/* Coinbase Wallet SDK — works even without browser extension (opens Coinbase app via QR) */}
              <WalletOption
                name="Coinbase Wallet"
                icon={<CoinbaseIcon />}
                onClick={() => onEvmConnect('coinbaseWalletSDK')}
                connecting={connectingId === 'coinbaseWalletSDK'}
                disabled={busy && connectingId !== 'coinbaseWalletSDK'}
                subtitle="Extension or mobile app"
              />

              {/* WalletConnect — Rainbow, Trust, Argent, 1inch, Ledger Live, etc. */}
              <WalletOption
                name="WalletConnect"
                icon={<WalletConnectIcon />}
                onClick={() => onEvmConnect('walletConnect')}
                connecting={connectingId === 'walletConnect'}
                disabled={busy && connectingId !== 'walletConnect'}
                subtitle="Rainbow, Trust, Argent, Ledger Live + 300 more"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-100" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-100" />
          </div>

          {/* Solana wallets */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Solana
            </p>
            <div className="space-y-2">
              <WalletOption
                name="Phantom"
                icon={<PhantomIcon />}
                onClick={() => onSolanaConnect('phantom')}
                connecting={connectingId === 'phantom'}
                disabled={(busy && connectingId !== 'phantom') || !hasPhantomSolana}
                subtitle={!hasPhantomSolana ? 'Install Phantom extension' : 'Connect on Solana'}
              />
              <WalletOption
                name="Solflare"
                icon={<SolflareIcon />}
                onClick={() => onSolanaConnect('solflare')}
                connecting={connectingId === 'solflare'}
                disabled={(busy && connectingId !== 'solflare') || !hasSolflare}
                subtitle={hasSolflare ? 'Connect on Solana' : 'Install Solflare extension'}
              />
            </div>
          </div>
        </div>

        <div className="px-5 pb-4">
          <p className="text-center text-xs text-gray-400">
            By connecting, you agree to our{' '}
            <a href="https://madhousewallet.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
              Terms of Service
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Connected chip ───────────────────────────────────────────────────────────

interface ConnectedChipProps {
  address: string
  chainId?: number
  isSolana?: boolean
  onDisconnect: () => void
}

function ConnectedChip({ address, chainId, isSolana, onDisconnect }: ConnectedChipProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
        {isSolana ? (
          <svg className="h-4 w-4 text-purple-500" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
            <path d="M6 22h17l3-3H9L6 22zM6 13h17l3-3H9L6 13zM26 17H9L6 20h17l3-3z"/>
          </svg>
        ) : (
          <span style={{ color: chainId ? CHAIN_ID_TO_COLOR[chainId] : '#6b7280' }}>
            <ChainIcon chainId={chainId ?? 1} size={14} />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isSolana ? (
            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
              Solana
            </span>
          ) : chainId ? (
            <ChainBadge chainId={chainId} />
          ) : null}
        </div>
        <p className="mt-0.5 font-mono text-xs text-gray-700 truncate">{shortenAddress(address)}</p>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors"
        aria-label="Disconnect wallet"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Network switcher dropdown (EVM only) ────────────────────────────────────

interface NetworkDropdownProps {
  currentChainId: number
  size?: 'sm' | 'md'
}

function NetworkDropdown({ currentChainId, size = 'md' }: NetworkDropdownProps) {
  const { switchChain, isPending } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const currentLabel = CHAIN_ID_TO_LABEL[currentChainId]
  const currentColor = CHAIN_ID_TO_COLOR[currentChainId] ?? '#6b7280'
  const isUnsupported = !CHAIN_ID_TO_NETWORK[currentChainId]

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return }
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
    if (!items || items.length === 0) return
    const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus() }
    if (e.key === 'ArrowUp')   { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus() }
    if (e.key === 'Home')      { e.preventDefault(); items[0].focus() }
    if (e.key === 'End')       { e.preventDefault(); items[items.length - 1].focus() }
  }

  async function handleSwitch(chainId: number) {
    setOpen(false)
    try { await switchChain({ chainId }) } catch { /* user rejected — non-fatal */ }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current network: ${currentLabel ?? `Chain ${currentChainId}`}. Click to switch.`}
        className={[
          'flex items-center gap-1.5 rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-60',
          size === 'sm' ? 'px-2 py-1 text-[11px] font-semibold' : 'px-2.5 py-1.5 text-xs font-semibold',
          isUnsupported
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:bg-orange-50',
        ].join(' ')}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: isUnsupported ? '#d97706' : currentColor }}
          aria-hidden="true"
        />
        {isUnsupported ? `Chain ${currentChainId}` : (currentLabel ?? `Chain ${currentChainId}`)}
        {isPending ? (
          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        ) : (
          <svg
            className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Switch network"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-50 mt-1.5 min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-100"
        >
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Switch Network
          </p>
          {SUPPORTED_EVM_CHAINS.map((chain) => {
            const isCurrent = chain.id === currentChainId
            const color = CHAIN_ID_TO_COLOR[chain.id] ?? '#6b7280'
            return (
              <button
                key={chain.id}
                role="menuitem"
                type="button"
                onClick={() => handleSwitch(chain.id)}
                disabled={isCurrent || isPending}
                aria-current={isCurrent ? 'true' : undefined}
                className={[
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors focus:outline-none',
                  isCurrent
                    ? 'cursor-default bg-gray-50 font-semibold text-gray-900'
                    : 'font-medium text-gray-700 hover:bg-orange-50 focus-visible:bg-orange-50',
                ].join(' ')}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="flex-1">{CHAIN_ID_TO_LABEL[chain.id]}</span>
                {isCurrent && (
                  <svg className="h-3.5 w-3.5 shrink-0 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                )}
              </button>
            )
          })}
          {isUnsupported && (
            <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-amber-600">
              This network is not supported. Please switch above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface WalletConnectProps {
  onConnected: (address: string, network: string) => void
  onDisconnected: () => void
  compact?: boolean
}

export function WalletConnect({ onConnected, onDisconnected, compact }: WalletConnectProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Ref used to guard stale finally-blocks from cancelled attempts.
  // If attempt A is cancelled and attempt B starts before A's finally fires,
  // A's finally sees currentAttemptRef.current !== 'A' and does not clear B's state.
  const currentAttemptRef = useRef<string | null>(null)

  const { evmWallets, hasPhantomSolana, hasSolflare } = useWalletDetection()

  // EVM — wagmi
  const { connectors, connectAsync } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const { address: evmAddress, isConnected: evmConnected } = useAccount()
  const chainId = useChainId()

  // Solana — stored in local state (no adapter context dependency)
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null)

  const { walletType, setWalletType } = useWalletType()

  // ── EVM auto-reconnect handling ─────────────────────────────────────────────
  // wagmi persists the last connection and auto-reconnects on mount.
  // We only propagate this if walletType is 'evm' (i.e. user chose EVM last time).
  // This prevents wagmi's auto-reconnect from overriding a Solana connection.
  useEffect(() => {
    if (walletType !== 'solana' && evmConnected && evmAddress) {
      if (walletType !== 'evm') setWalletType('evm')
      const network = CHAIN_ID_TO_NETWORK[chainId] ?? 'ethereum'
      onConnected(evmAddress, network)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evmConnected, evmAddress, chainId, walletType])

  // ── Connection handlers ─────────────────────────────────────────────────────

  // providerOverride: when the user clicks a specific injected wallet (e.g. Rabby when
  // MetaMask is also installed), we temporarily swap window.ethereum to that provider
  // so wagmi's injected() connector picks up the right one.
  const handleEvmConnect = useCallback(async (connectorId: string, providerOverride?: EthProvider) => {
    setError(null)
    setConnectingId(connectorId)
    currentAttemptRef.current = connectorId

    const isWC = connectorId === 'walletConnect'
    if (isWC) setModalOpen(false)

    // Temporarily override window.ethereum for injected wallets when multiple are installed
    const win = window as unknown as Record<string, unknown>
    const originalEthereum = win.ethereum
    if (providerOverride && connectorId.startsWith('injected-')) {
      win.ethereum = providerOverride
    }

    try {
      if (walletType === 'solana') {
        setSolanaAddress(null)
        setWalletType(null)
      }

      // For specific injected wallets, use the base 'injected' connector type.
      // For coinbaseWalletSDK and walletConnect, match by id/type.
      const isInjectedWallet = connectorId.startsWith('injected-')
      const connector = connectors.find((c) =>
        isInjectedWallet ? c.type === 'injected' : (c.id === connectorId || c.type === connectorId),
      )
      if (!connector) {
        throw new Error(
          `No connector found for "${connectorId}". Available: ${connectors.map((c) => `${c.id}(${c.type})`).join(', ')}`,
        )
      }

      if (evmConnected) {
        await disconnectAsync()
      }

      const result = await connectAsync({ connector })
      const address = result.accounts[0]
      const network = CHAIN_ID_TO_NETWORK[result.chainId] ?? 'ethereum'

      setWalletType('evm')
      onConnected(address, network)
      setModalOpen(false)
    } catch (err) {
      console.error('[WalletConnect] EVM connect error:', err)
      const msg = extractErrorMessage(err)
      if (msg) {
        if (isWC) setModalOpen(true)
        setError(msg)
      }
    } finally {
      // Restore original window.ethereum
      if (providerOverride && connectorId.startsWith('injected-')) {
        win.ethereum = originalEthereum
      }
      if (currentAttemptRef.current === connectorId) {
        setConnectingId(null)
        currentAttemptRef.current = null
      }
    }
  }, [connectors, connectAsync, disconnectAsync, evmConnected, walletType, setWalletType, onConnected])

  const handleSolanaConnect = useCallback(async (walletKey: 'phantom' | 'solflare') => {
    setError(null)
    setConnectingId(walletKey)
    currentAttemptRef.current = walletKey

    try {
      // Clear any active EVM connection before switching to Solana
      if (walletType === 'evm' || evmConnected) {
        await disconnectAsync().catch(() => {/* non-fatal */})
        setWalletType(null)
      }

      const win = window as unknown as Record<string, unknown>
      let provider: SolanaProvider | undefined

      if (walletKey === 'phantom') {
        const phantom = win.phantom as Record<string, unknown> | undefined
        // Prefer window.phantom.solana (modern Phantom) over window.solana (legacy)
        provider = (phantom?.solana ?? win.solana) as SolanaProvider | undefined
        if (!provider) {
          throw new Error('Phantom not detected. Install the Phantom browser extension.')
        }
      } else {
        provider = win.solflare as SolanaProvider | undefined
        if (!provider) {
          throw new Error('Solflare not detected. Install the Solflare browser extension.')
        }
      }

      // If the provider is already connected, use the cached public key directly
      // to avoid unnecessarily prompting the user again.
      let address: string
      if (provider.isConnected && provider.publicKey) {
        address = provider.publicKey.toBase58()
      } else {
        const response = await provider.connect()
        if (!response?.publicKey) {
          throw new Error('Wallet connected but returned no public key.')
        }
        address = response.publicKey.toBase58()
      }

      // Validate: Solana addresses are base58, 32–44 chars, no '0x' prefix
      if (!address || address.startsWith('0x') || address.length < 32) {
        throw new Error(`Unexpected address format from ${walletKey}: ${address}`)
      }

      setSolanaAddress(address)
      setWalletType('solana')
      onConnected(address, 'solana')
      setModalOpen(false)
    } catch (err) {
      console.error(`[WalletConnect] ${walletKey} connect error:`, err)
      const msg = extractErrorMessage(err)
      if (msg) {
        setError(msg)
      }
      // Don't show error for user-cancelled (extractErrorMessage returns null)
    } finally {
      if (currentAttemptRef.current === walletKey) {
        setConnectingId(null)
        currentAttemptRef.current = null
      }
    }
  }, [walletType, evmConnected, disconnectAsync, setWalletType, onConnected])

  const handleDisconnect = useCallback(async () => {
    try {
      if (walletType === 'evm') {
        await disconnectAsync()
      } else if (walletType === 'solana' && solanaAddress) {
        // Best-effort native disconnect
        const win = window as unknown as Record<string, unknown>
        const phantom = win.phantom as Record<string, unknown> | undefined
        const phantomProvider = (phantom?.solana ?? win.solana) as SolanaProvider | undefined
        const solflareProvider = win.solflare as SolanaProvider | undefined
        try { await (phantomProvider?.disconnect ?? solflareProvider?.disconnect ?? (() => Promise.resolve()))() } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('[WalletConnect] disconnect error:', err)
    } finally {
      setSolanaAddress(null)
      setWalletType(null)
      setError(null)
      setConnectingId(null)
      currentAttemptRef.current = null
      onDisconnected()
    }
  }, [walletType, solanaAddress, disconnectAsync, setWalletType, onDisconnected])

  // ── Derived connected state ─────────────────────────────────────────────────
  // Single source of truth for what's shown in the UI.

  const isConnected =
    (walletType === 'evm' && evmConnected && !!evmAddress) ||
    (walletType === 'solana' && !!solanaAddress)

  const address = walletType === 'evm' ? evmAddress : walletType === 'solana' ? solanaAddress ?? undefined : undefined

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isConnected && address) {
    if (compact) {
      return (
        <div className="flex items-center gap-1.5">
          {walletType === 'evm' && chainId ? (
            <NetworkDropdown currentChainId={chainId} size="sm" />
          ) : (
            <span className="rounded-full bg-purple-100 px-2 py-1 text-[11px] font-semibold text-purple-700">
              Solana
            </span>
          )}
          <span className="font-mono text-xs text-gray-600">{shortenAddress(address)}</span>
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors"
            aria-label="Disconnect wallet"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <ConnectedChip
          address={address}
          chainId={walletType === 'evm' ? chainId : undefined}
          isSolana={walletType === 'solana'}
          onDisconnect={handleDisconnect}
        />
        {walletType === 'evm' && chainId && (
          <NetworkDropdown currentChainId={chainId} size="md" />
        )}
      </div>
    )
  }

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => { setError(null); setModalOpen(true) }}
          className="flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-600 transition-all hover:border-orange-400 hover:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 active:scale-[0.98]"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Connect Wallet
        </button>
        {modalOpen && (
          <WalletModal
            onClose={() => { setModalOpen(false); setConnectingId(null); currentAttemptRef.current = null }}
            onEvmConnect={handleEvmConnect}
            onSolanaConnect={handleSolanaConnect}
            connectingId={connectingId}
            error={error}
            evmWallets={evmWallets}
            hasPhantomSolana={hasPhantomSolana}
            hasSolflare={hasSolflare}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => { setError(null); setModalOpen(true) }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-600 transition-all hover:border-orange-400 hover:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 active:scale-[0.99]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Connect Wallet
        </button>
        {error && <p className="text-xs text-red-600 text-center">{error}</p>}
      </div>
      {modalOpen && (
        <WalletModal
          onClose={() => { setModalOpen(false); setConnectingId(null); currentAttemptRef.current = null }}
          onEvmConnect={handleEvmConnect}
          onSolanaConnect={handleSolanaConnect}
          connectingId={connectingId}
          error={error}
          evmWallets={evmWallets}
          hasPhantomSolana={hasPhantomSolana}
          hasSolflare={hasSolflare}
        />
      )}
    </>
  )
}
