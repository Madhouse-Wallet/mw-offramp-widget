import React, { createContext, useContext } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '../lib/wallet-config'

const queryClient = new QueryClient()

// ─── Active wallet type context ───────────────────────────────────────────────
// Shared signal: which wallet ecosystem is currently connected ('evm' | 'solana' | null).
// This prevents wagmi's auto-reconnect from overriding a Solana connection.

type WalletType = 'evm' | 'solana' | null

interface WalletTypeCtx {
  walletType: WalletType
  setWalletType: (t: WalletType) => void
}

const WalletTypeContext = createContext<WalletTypeCtx>({
  walletType: null,
  setWalletType: () => {},
})

export function useWalletType() {
  return useContext(WalletTypeContext)
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode
}

export function WalletProvider({ children }: Props) {
  const [walletType, setWalletType] = React.useState<WalletType>(null)

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletTypeContext.Provider value={{ walletType, setWalletType }}>
          {children}
        </WalletTypeContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
