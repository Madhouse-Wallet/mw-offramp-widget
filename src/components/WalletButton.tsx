import React, { useState, useEffect, useRef } from 'react'
import type { EthProvider } from '@/types'
import { getWallets } from '@wallet-standard/app'

interface EVMWalletDetail {
  name: string
  icon: string
  rdns: string
  provider: unknown
}

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function WalletButton({
  evmAddress,
  solanaAddress,
  onEvmConnect,
  onEvmDisconnect,
  onSolanaConnect,
  onSolanaDisconnect,
  onOpenChange,
}: {
  evmAddress: string | null
  solanaAddress: string | null
  onEvmConnect: (address: string, provider: EthProvider) => void
  onEvmDisconnect: () => void
  onSolanaConnect: (address: string) => void
  onSolanaDisconnect: () => void
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [evmError, setEvmError] = useState<string | null>(null)
  const [solanaError, setSolanaError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const wcProviderRef = useRef<EthProvider | null>(null)
  const cbProviderRef = useRef<EthProvider | null>(null)
  // Track which connection method is active
  const evmConnectionType = useRef<'walletconnect' | 'coinbase-ext' | 'coinbase-sw' | 'wallet-browser' | 'eip6963' | null>(null)
  const solanaConnectionType = useRef<'phantom' | 'solflare' | 'wallet-standard' | 'wallet-browser' | null>(null)

  // Tier 1 + 2 state
  const [inWalletBrowser, setInWalletBrowser] = useState(false)
  const [eip6963Wallets, setEip6963Wallets] = useState<EVMWalletDetail[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [standardSolanaWallets, setStandardSolanaWallets] = useState<any[]>([])

  // Tier 1 + 2 refs
  const walletBrowserEvmProviderRef = useRef<EthProvider | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eip6963ProviderRef = useRef<any | null>(null)
  const eip6963ConnectedNameRef = useRef<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const standardWalletRef = useRef<any | null>(null)

  // Notify parent when dropdown opens/closes
  useEffect(() => {
    onOpenChange?.(open)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Tier 1 — detect whether we're inside a wallet's built-in browser
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum
    const ua = navigator.userAgent.toLowerCase()
    const detected = !!(
      eth?.isMetaMask ||
      eth?.isPhantom ||
      eth?.isTrust ||
      eth?.isTrustWallet ||
      (eth?.isCoinbaseWallet && ua.includes('coinbase')) ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).okxwallet ||
      eth?.isOkxWallet ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).trustwallet ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).phantom?.solana
    )
    setInWalletBrowser(detected)
  }, [])

  // Tier 2 EVM — EIP-6963 wallet scanner (skipped inside wallet browsers)
  useEffect(() => {
    if (inWalletBrowser) return
    const seen = new Map<string, EVMWalletDetail>()
    function onAnnounce(event: Event) {
      const e = event as CustomEvent
      const { info, provider } = e.detail
      if (!seen.has(info.rdns)) {
        seen.set(info.rdns, { name: info.name, icon: info.icon, rdns: info.rdns, provider })
        setEip6963Wallets([...seen.values()])
      }
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce as EventListener)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce as EventListener)
  }, [inWalletBrowser])

  // Tier 2 Solana — Wallet Standard bus scanner
  useEffect(() => {
    const { get, on } = getWallets()
    function refresh() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setStandardSolanaWallets(get().filter((w: any) => w.chains?.some((c: string) => c.startsWith('solana:'))))
    }
    refresh()
    const unsubscribe = on('register', refresh)
    return () => { unsubscribe() }
  }, [])

  async function connectWalletConnect() {
    setEvmError(null)
    try {
      // Always disconnect and discard the old provider to avoid stale session errors
      if (wcProviderRef.current) {
        try { await (wcProviderRef.current as any).disconnect() } catch { /* ignore */ } // eslint-disable-line @typescript-eslint/no-explicit-any
        wcProviderRef.current = null
      }

      // Clear any stale WalletConnect v2 entries from localStorage so init starts clean
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('wc@2:'))
          .forEach((k) => localStorage.removeItem(k))
      } catch { /* localStorage may be unavailable (e.g. in an iframe) */ }

      // Dynamic import keeps WalletConnect out of the initial bundle
      const { default: EthereumProvider } = await import('@walletconnect/ethereum-provider')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = await (EthereumProvider as any).init({
        projectId: WC_PROJECT_ID,
        chains: [1],
        optionalChains: [8453, 42161, 43114, 137],
        showQrModal: true,
        metadata: {
          name: 'Madhouse Wallet Offramp',
          description: 'Sell USDC to local currency',
          url: window.location.origin,
          icons: [`${window.location.origin}/mw.png`],
        },
      })
      p.on('accountsChanged', (accounts: unknown) => {
        const accs = accounts as string[]
        if (!accs.length) { wcProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() }
      })
      p.on('disconnect', () => { wcProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() })
      wcProviderRef.current = p as EthProvider

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (p as any).connect()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accounts = (p as any).accounts as string[]
      if (accounts[0]) {
        evmConnectionType.current = 'walletconnect'
        onEvmConnect(accounts[0], wcProviderRef.current!)
      }
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string }
      const msg = (e?.message ?? '').toLowerCase()
      if (e?.code === 4001 || msg.includes('user rejected') || msg.includes('user closed') || msg.includes('modal closed')) return
      setEvmError('Connection failed. Please try again.')
    }
  }

  async function connectCoinbaseExtension() {
    setEvmError(null)
    try {
      // ── 1. Use the browser extension if installed ─────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ext: any = null
      if (win.ethereum?.isCoinbaseWallet) {
        ext = win.ethereum
      } else if (Array.isArray(win.ethereum?.providers)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ext = win.ethereum.providers.find((p: any) => p.isCoinbaseWallet) ?? null
      }

      if (ext) {
        const accounts: string[] = await ext.request({ method: 'eth_requestAccounts' })
        if (accounts[0]) {
          cbProviderRef.current = ext as EthProvider
          evmConnectionType.current = 'coinbase-ext'
          ext.on?.('accountsChanged', (accs: string[]) => {
            if (!accs.length) { cbProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() }
            else onEvmConnect(accs[0], cbProviderRef.current!)
          })
          ext.on?.('disconnect', () => { cbProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() })
          onEvmConnect(accounts[0], ext as EthProvider)
        }
        return
      }

      // ── 2. Extension not found — fall back to Coinbase Wallet mobile app (QR) ─
      const { CoinbaseWalletSDK } = await import('@coinbase/wallet-sdk')
      const sdk = new CoinbaseWalletSDK({
        appName: 'Madhouse Wallet Offramp',
        appLogoUrl: `${window.location.origin}/mw.png`,
        appChainIds: [8453, 42161, 1, 43114, 137],
      })
      // 'eoaOnly' skips Smart Wallet and shows a QR code for the Coinbase Wallet mobile app
      const p = sdk.makeWeb3Provider({ options: 'eoaOnly' })
      const accounts = await p.request({ method: 'eth_requestAccounts' }) as string[]
      if (accounts[0]) {
        cbProviderRef.current = p as unknown as EthProvider
        evmConnectionType.current = 'coinbase-ext'
        p.on('accountsChanged', (accs: string[]) => {
          if (!accs.length) { cbProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() }
          else onEvmConnect(accs[0], cbProviderRef.current!)
        })
        p.on('disconnect', () => { cbProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() })
        onEvmConnect(accounts[0], cbProviderRef.current)
      }
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string }
      const msg = (e?.message ?? '').toLowerCase()
      if (e?.code === 4001 || msg.includes('user rejected') || msg.includes('user denied') || msg.includes('cancelled')) return
      setEvmError('Connection failed. Please try again.')
    }
  }

  async function connectCoinbaseSmartWallet() {
    setEvmError(null)
    try {
      // Dynamic import keeps the SDK out of the initial bundle
      const { CoinbaseWalletSDK } = await import('@coinbase/wallet-sdk')
      const sdk = new CoinbaseWalletSDK({
        appName: 'Madhouse Wallet Offramp',
        appLogoUrl: `${window.location.origin}/mw.png`,
        appChainIds: [8453, 42161, 1, 43114, 137],
      })
      // 'smartWalletOnly' opens a keys.coinbase.com browser popup — no phone needed
      const p = sdk.makeWeb3Provider({ options: 'smartWalletOnly' })
      const accounts = await p.request({ method: 'eth_requestAccounts' }) as string[]
      if (accounts[0]) {
        cbProviderRef.current = p as unknown as EthProvider
        evmConnectionType.current = 'coinbase-sw'
        p.on('accountsChanged', (accs: string[]) => {
          if (!accs.length) { cbProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() }
          else onEvmConnect(accs[0], cbProviderRef.current!)
        })
        p.on('disconnect', () => { cbProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() })
        onEvmConnect(accounts[0], cbProviderRef.current)
      }
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string }
      const msg = (e?.message ?? '').toLowerCase()
      if (e?.code === 4001 || msg.includes('user rejected') || msg.includes('user denied') || msg.includes('cancelled')) return
      setEvmError('Connection failed. Please try again.')
    }
  }

  // ── Tier 1 — connect both EVM + Solana from wallet browser ───────────────────
  async function connectWalletBrowser() {
    setEvmError(null)
    setSolanaError(null)
    // EVM — independent try/catch so Solana failure doesn't abort EVM
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eth = (window as any).ethereum as EthProvider
      if (eth) {
        const accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[]
        if (accounts[0]) {
          walletBrowserEvmProviderRef.current = eth
          evmConnectionType.current = 'wallet-browser'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(eth as any).on?.('accountsChanged', (accs: string[]) => {
            if (!accs.length) { walletBrowserEvmProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() }
            else onEvmConnect(accs[0], walletBrowserEvmProviderRef.current!)
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(eth as any).on?.('disconnect', () => { walletBrowserEvmProviderRef.current = null; evmConnectionType.current = null; onEvmDisconnect() })
          onEvmConnect(accounts[0], eth)
        }
      }
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string }
      if (e?.code !== 4001) setEvmError('EVM connection failed. Try again.')
    }
    // Solana — independent try/catch
    try {
      const { get } = getWallets()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solWallet = get().find((w: any) => w.chains?.some((c: string) => c.startsWith('solana:')))
      if (solWallet) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (solWallet as any).features['standard:connect'].connect({ silent: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const addr = (result as any).accounts?.[0]?.address as string | undefined
        if (addr) {
          standardWalletRef.current = solWallet
          solanaConnectionType.current = 'wallet-browser'
          onSolanaConnect(addr)
        }
      }
    } catch { /* Solana wallet not available or user declined — silent */ }
  }

  // ── Tier 2 EVM — connect via EIP-6963 selected extension ──────────────────────
  async function connectEIP6963(provider: unknown, name: string) {
    setEvmError(null)
    try {
      const accounts = await (provider as EthProvider).request({ method: 'eth_requestAccounts' }) as string[]
      if (accounts[0]) {
        eip6963ProviderRef.current = provider
        eip6963ConnectedNameRef.current = name
        evmConnectionType.current = 'eip6963'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(provider as any).on?.('accountsChanged', (accs: string[]) => {
          if (!accs.length) { eip6963ProviderRef.current = null; eip6963ConnectedNameRef.current = null; evmConnectionType.current = null; onEvmDisconnect() }
          else onEvmConnect(accs[0], eip6963ProviderRef.current as EthProvider)
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(provider as any).on?.('disconnect', () => { eip6963ProviderRef.current = null; eip6963ConnectedNameRef.current = null; evmConnectionType.current = null; onEvmDisconnect() })
        onEvmConnect(accounts[0], provider as EthProvider)
      }
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string }
      const msg = (e?.message ?? '').toLowerCase()
      if (e?.code === 4001 || msg.includes('user rejected') || msg.includes('user denied')) return
      setEvmError('Connection failed. Please try again.')
    }
  }

  // ── Tier 2 Solana — connect via Wallet Standard bus ────────────────────────────
  async function connectWalletStandard(wallet: unknown) {
    setSolanaError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (wallet as any).features['standard:connect'].connect()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addr = (result as any).accounts?.[0]?.address as string | undefined
      if (addr) {
        standardWalletRef.current = wallet
        solanaConnectionType.current = 'wallet-standard'
        onSolanaConnect(addr)
      }
    } catch { setSolanaError('Connection declined.') }
  }

  async function disconnectEvm() {
    if (evmConnectionType.current === 'wallet-browser') {
      walletBrowserEvmProviderRef.current = null
    } else if (evmConnectionType.current === 'eip6963') {
      eip6963ProviderRef.current = null
      eip6963ConnectedNameRef.current = null
    } else if (evmConnectionType.current === 'walletconnect' && wcProviderRef.current) {
      try { await (wcProviderRef.current as any).disconnect() } catch { /* ignore */ } // eslint-disable-line @typescript-eslint/no-explicit-any
      wcProviderRef.current = null
    } else if ((evmConnectionType.current === 'coinbase-ext' || evmConnectionType.current === 'coinbase-sw') && cbProviderRef.current) {
      try { await (cbProviderRef.current as any).disconnect() } catch { /* ignore */ } // eslint-disable-line @typescript-eslint/no-explicit-any
      cbProviderRef.current = null
    }
    evmConnectionType.current = null
    onEvmDisconnect()
  }

  async function connectPhantom() {
    setSolanaError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sol = (window as any).phantom?.solana
    if (!sol) { setSolanaError('Phantom not found. Install the Phantom extension.'); return }
    try {
      const res = await sol.connect()
      solanaConnectionType.current = 'phantom'
      onSolanaConnect(res.publicKey.toString())
    } catch { setSolanaError('Connection declined.') }
  }

  async function connectSolflare() {
    setSolanaError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sol = (window as any).solflare
    if (!sol) { setSolanaError('Solflare not found. Install the Solflare extension.'); return }
    try {
      const res = await sol.connect()
      solanaConnectionType.current = 'solflare'
      onSolanaConnect(res.publicKey.toString())
    } catch { setSolanaError('Connection declined.') }
  }

  function disconnectSolana() {
    if (solanaConnectionType.current === 'wallet-standard' || solanaConnectionType.current === 'wallet-browser') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        standardWalletRef.current?.features?.['standard:disconnect']?.disconnect().catch(() => {})
      } catch { /* ignore */ }
      standardWalletRef.current = null
    }
    solanaConnectionType.current = null
    onSolanaDisconnect()
  }

  const connectedCount = (evmAddress ? 1 : 0) + (solanaAddress ? 1 : 0)
  const buttonLabel =
    connectedCount === 0
      ? 'Connect Wallet'
      : connectedCount === 2
      ? '2 Connected'
      : evmAddress
      ? truncateAddress(evmAddress)
      : truncateAddress(solanaAddress!)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group relative flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold focus:outline-none transition-all duration-300"
        style={{
          background: connectedCount > 0
            ? 'rgba(255,255,255,0.12)'
            : 'rgba(239,82,0,0.15)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: connectedCount > 0
            ? '1px solid rgba(239,82,0,0.35)'
            : '1px solid rgba(239,82,0,0.6)',
          color: connectedCount > 0 ? '#ef5200' : 'white',
          boxShadow: connectedCount > 0
            ? '0 0 0 0 rgba(239,82,0,0), inset 0 1px 0 rgba(255,255,255,0.15)'
            : '0 0 3px rgba(239,82,0,0.07), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = connectedCount > 0
            ? '0 0 4px rgba(239,82,0,0.08), 0 0 1px rgba(239,82,0,0.04), inset 0 1px 0 rgba(255,255,255,0.2)'
            : '0 0 5px rgba(239,82,0,0.12), 0 0 2px rgba(239,82,0,0.06), inset 0 1px 0 rgba(255,255,255,0.25)'
          e.currentTarget.style.borderColor = 'rgba(239,82,0,0.9)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = connectedCount > 0
            ? '0 0 0 0 rgba(239,82,0,0), inset 0 1px 0 rgba(255,255,255,0.15)'
            : '0 0 3px rgba(239,82,0,0.07), inset 0 1px 0 rgba(255,255,255,0.2)'
          e.currentTarget.style.borderColor = connectedCount > 0 ? 'rgba(239,82,0,0.35)' : 'rgba(239,82,0,0.6)'
        }}
      >
        {/* Orange glow ring behind button — visible on hover via CSS group */}
        <span
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ boxShadow: '0 0 0 1px rgba(239,82,0,0.5)' }}
          aria-hidden="true"
        />

        {connectedCount > 0 && (
          <span className="h-2 w-2 rounded-full bg-green-400 shrink-0 shadow-[0_0_6px_rgba(74,222,128,0.8)]" aria-hidden="true" />
        )}
        {connectedCount === 0 && (
          <svg className="h-4 w-4 shrink-0 text-[#ef5200]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
            <circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
        )}
        {connectedCount === 0 ? (
          <>
            <span className="sm:hidden text-[#ef5200] dark:text-white font-semibold">Connect</span>
            <span className="hidden sm:inline text-[#ef5200] dark:text-white font-semibold">Connect Wallet</span>
          </>
        ) : (
          <span className={connectedCount > 0 ? 'text-[#ef5200] dark:text-orange-300' : 'text-[#ef5200] dark:text-white font-semibold'}>
            {buttonLabel}
          </span>
        )}
        <svg className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''} ${connectedCount > 0 ? 'text-[#ef5200]' : 'text-[#ef5200] dark:text-white'}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white dark:bg-gray-900 shadow-xl dark:shadow-gray-950/60 ring-1 ring-gray-200 dark:ring-gray-700 z-50 overflow-hidden">
          <div className="wallet-scroll overflow-y-auto max-h-[60vh] p-3 space-y-2">
          {/* Optional wallet notice */}
          <div className="flex items-start gap-2 rounded-xl bg-orange-50 dark:bg-[#ef5200]/10 border border-orange-200 dark:border-[#ef5200]/30 px-3 py-2.5">
            <svg className="h-4 w-4 shrink-0 mt-0.5 text-[#ef5200] dark:text-[#fd754d]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd"/>
            </svg>
            <p className="text-xs text-orange-900 dark:text-orange-100 leading-relaxed">
              <span className="font-semibold">Wallet connection is optional.</span> You can copy the USDC deposit address at the final step and send funds manually from any wallet.
            </p>
          </div>

          {/* Tier 1 — Wallet Browser: shown only when inside a wallet's built-in browser */}
          {inWalletBrowser && (
            <>
              <div>
                <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Wallet Browser</p>
                <button
                  onClick={connectWalletBrowser}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 dark:border-[#ef5200]/30 bg-orange-50 dark:bg-[#ef5200]/10 px-3 py-2 text-sm font-medium text-orange-900 dark:text-orange-100 hover:bg-orange-100 dark:hover:bg-[#ef5200]/20 transition-colors"
                >
                  <svg className="h-5 w-5 shrink-0 text-[#ef5200]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="2" y="7" width="20" height="14" rx="2"/>
                    <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
                    <circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/>
                  </svg>
                  Connect to Wallet Browser
                </button>
                {(evmError || solanaError) && (
                  <p className="mt-1 px-1 text-xs text-red-500">{evmError ?? solanaError}</p>
                )}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-700/50"/>
            </>
          )}

          {/* EVM */}
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">EVM Wallets</p>
            {evmAddress ? (
              <div className="flex items-center justify-between rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" aria-hidden="true"/>
                  <span className="text-xs font-mono text-gray-800 dark:text-gray-200">{truncateAddress(evmAddress)}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {evmConnectionType.current === 'wallet-browser' ? '· Wallet Browser'
                      : evmConnectionType.current === 'eip6963' ? `· ${eip6963ConnectedNameRef.current ?? 'Extension'}`
                      : evmConnectionType.current === 'walletconnect' ? '· WalletConnect'
                      : evmConnectionType.current === 'coinbase-ext' ? '· Coinbase Extension'
                      : '· Base Smart Wallet'}
                  </span>
                </div>
                <button onClick={disconnectEvm} className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">Disconnect</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Tier 2 EVM — EIP-6963 detected extensions */}
                {eip6963Wallets.map((w) => (
                  <button
                    key={w.rdns}
                    onClick={() => connectEIP6963(w.provider, w.name)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-[#ef5200] hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-[#ef5200] transition-colors"
                  >
                    {w.icon
                      ? <img src={w.icon} className="h-5 w-5 shrink-0 rounded-sm" alt="" aria-hidden="true" />
                      : <span className="h-5 w-5 shrink-0 rounded-sm bg-gray-200 dark:bg-gray-700" aria-hidden="true" />}
                    {w.name}
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Extension</span>
                  </button>
                ))}
                {/* WalletConnect option (mobile) */}
                <button onClick={connectWalletConnect} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                  <svg viewBox="0 0 300 185" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
                    <path d="M61.4 36c48.9-47.9 128.2-47.9 177.1 0l5.9 5.8a6 6 0 010 8.7l-20.1 19.7a3.2 3.2 0 01-4.4 0l-8.1-7.9c-34.1-33.5-89.5-33.5-123.7 0l-8.7 8.5a3.2 3.2 0 01-4.4 0L54.9 50.1a6 6 0 010-8.7L61.4 36zm235.5 43.9l17.9 17.5a6 6 0 010 8.7L227 192.6a6.3 6.3 0 01-8.8 0l-57.3-56.1a1.6 1.6 0 00-2.2 0l-57.3 56.1a6.3 6.3 0 01-8.8 0L5.2 106.1a6 6 0 010-8.7l17.9-17.5a6.3 6.3 0 018.8 0l57.3 56.1c.6.6 1.6.6 2.2 0l57.3-56.1a6.3 6.3 0 018.8 0l57.3 56.1c.6.6 1.6.6 2.2 0l57.3-56.1a6.3 6.3 0 018.8 0z" fill="#3B99FC"/>
                  </svg>
                  Mobile Wallet (WalletConnect)
                </button>
                {/* Coinbase Wallet extension */}
                <button onClick={connectCoinbaseExtension} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-[#0052FF] hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-[#0052FF] transition-colors">
                  <svg viewBox="0 0 40 40" className="h-5 w-5 shrink-0" aria-hidden="true">
                    <circle cx="20" cy="20" r="20" fill="#0052FF"/>
                    <circle cx="20" cy="20" r="12" fill="white"/>
                    <rect x="15" y="18" width="10" height="4" rx="1" fill="#0052FF"/>
                  </svg>
                  Coinbase Wallet App
                </button>
                {/* Base Smart Wallet — browser popup, no phone */}
                <button onClick={connectCoinbaseSmartWallet} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-[#0052FF] hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-[#0052FF] transition-colors">
                  <svg viewBox="0 0 40 40" className="h-5 w-5 shrink-0" aria-hidden="true">
                    <circle cx="20" cy="20" r="20" fill="#0052FF"/>
                    <circle cx="20" cy="20" r="12" fill="white"/>
                    <rect x="15" y="18" width="10" height="4" rx="1" fill="#0052FF"/>
                    <circle cx="20" cy="14" r="2" fill="#0052FF"/>
                  </svg>
                  Base Smart Wallet
                </button>
                {evmError && <p className="mt-1 px-1 text-xs text-red-500">{evmError}</p>}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100"/>

          {/* Solana */}
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Solana</p>
            {solanaAddress ? (
              <div className="flex items-center justify-between rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" aria-hidden="true"/>
                  <span className="text-xs font-mono text-gray-800 dark:text-gray-200">{truncateAddress(solanaAddress)}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {solanaConnectionType.current === 'wallet-browser' ? '· Wallet Browser'
                      : solanaConnectionType.current === 'wallet-standard' ? `· ${standardWalletRef.current?.name ?? 'Extension'}`
                      : solanaConnectionType.current === 'phantom' ? '· Phantom'
                      : solanaConnectionType.current === 'solflare' ? '· Solflare'
                      : ''}
                  </span>
                </div>
                <button onClick={disconnectSolana} className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">Disconnect</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Tier 2 Solana — Wallet Standard bus */}
                {standardSolanaWallets.map((w) => (
                  <button
                    key={w.name}
                    onClick={() => connectWalletStandard(w)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-[#ef5200] hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-[#ef5200] transition-colors"
                  >
                    {w.icon
                      ? <img src={w.icon} className="h-5 w-5 shrink-0 rounded-sm" alt="" aria-hidden="true" />
                      : <span className="h-5 w-5 shrink-0 rounded-sm bg-gray-200 dark:bg-gray-700" aria-hidden="true" />}
                    {w.name}
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Extension</span>
                  </button>
                ))}
                {/* Phantom + Solflare — shown only if Wallet Standard bus found no wallets */}
                {standardSolanaWallets.length === 0 && (
                  <>
                    <button onClick={connectPhantom} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 hover:text-purple-700 dark:hover:text-purple-300 transition-colors">
                      <svg viewBox="0 0 128 128" className="h-5 w-5 shrink-0" aria-hidden="true">
                        <circle cx="64" cy="64" r="64" fill="#AB9FF2"/>
                        <path d="M110.5 64.8C110.5 41.1 91.3 22 68 22c-24.6 0-44.3 20-43.5 44.9.5 14.8 8 27.8 19.2 35.8 2.2 1.6 5.3.4 6-2.2.3-1.2.1-2.5-.6-3.5-4.6-6.5-7.3-14.4-7.3-23 0-22.1 18.1-40 40.2-39.5 21.5.5 38.5 18.3 38.5 39.9 0 8.2-2.5 15.8-6.7 22.1-.8 1.2-1 2.7-.5 4 .8 2.5 3.8 3.5 5.9 1.9 10.4-8.1 17.3-20.5 17.3-34.6z" fill="white"/>
                        <ellipse cx="80" cy="67" rx="7" ry="10" fill="#AB9FF2"/>
                        <ellipse cx="52" cy="67" rx="7" ry="10" fill="#AB9FF2"/>
                        <ellipse cx="78" cy="64" rx="3.5" ry="5" fill="white"/>
                        <ellipse cx="50" cy="64" rx="3.5" ry="5" fill="white"/>
                      </svg>
                      Phantom
                    </button>
                    <button onClick={connectSolflare} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-[#fd754d] hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-[#ef5200] transition-colors">
                      <svg viewBox="0 0 128 128" className="h-5 w-5 shrink-0" aria-hidden="true">
                        <circle cx="64" cy="64" r="64" fill="#FC5E03"/>
                        <path d="M64 24 C42 24 24 42 24 64 C24 86 42 104 64 104 C86 104 104 86 104 64 C104 42 86 24 64 24Z" fill="white" opacity="0.15"/>
                        <path d="M88 44 L52 44 C48 44 44 48 44 52 L44 60 L76 60 L64 84 L88 84 C92 84 96 80 96 76 L96 52 C96 48 92 44 88 44Z" fill="white"/>
                      </svg>
                      Solflare
                    </button>
                  </>
                )}
                {solanaError && <p className="mt-1 px-1 text-xs text-red-500">{solanaError}</p>}
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  )
}