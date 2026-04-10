import { http, createConfig } from 'wagmi'
import { mainnet, base, polygon, arbitrum, avalanche } from 'wagmi/chains'
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors'

export const REOWN_PROJECT_ID = '8c9470c302eb2a9e923d5a4833b4ebd6'

// EVM chains we support
export const SUPPORTED_EVM_CHAINS = [mainnet, base, polygon, arbitrum, avalanche] as const

// Chain ID → network string used by MW transfer API
export const CHAIN_ID_TO_NETWORK: Record<number, string> = {
  1:     'ethereum',
  8453:  'base',
  137:   'polygon',
  42161: 'arbitrum',
  43114: 'avalanche',
}

// Chain ID → display label
export const CHAIN_ID_TO_LABEL: Record<number, string> = {
  1:     'Ethereum',
  8453:  'Base',
  137:   'Polygon',
  42161: 'Arbitrum',
  43114: 'Avalanche',
}

// Chain ID → brand color (Tailwind-compatible hex)
export const CHAIN_ID_TO_COLOR: Record<number, string> = {
  1:     '#627EEA', // Ethereum blue
  8453:  '#0052FF', // Base blue
  137:   '#8247E5', // Polygon purple
  42161: '#12AAFF', // Arbitrum blue
  43114: '#E84142', // Avalanche red
}

// Network string → source tokens supported on that rail
// Drives the source token selector in AmountStep
export const NETWORK_TO_SOURCE_TOKENS: Record<string, ('usdc' | 'eurc')[]> = {
  ethereum: ['usdc', 'eurc'],
  base:     ['usdc', 'eurc'],
  polygon:  ['usdc'],
  arbitrum: ['usdc'],
  avalanche:['usdc'],
  solana:   ['usdc', 'eurc'],
}

// Singleton — prevents WalletConnect double-init on Next.js HMR re-evaluation
function makeConfig() {
  return createConfig({
    chains: SUPPORTED_EVM_CHAINS,
    connectors: [
      // injected covers MetaMask, Rabby, Phantom EVM, Brave, and any other window.ethereum wallet
      injected(),
      coinbaseWallet({ appName: 'Madhouse Wallet Offramp' }),
      // showQrModal: true — WalletConnect needs its own QR modal to work
      walletConnect({ projectId: REOWN_PROJECT_ID }),
    ],
    transports: {
      [mainnet.id]:   http(),
      [base.id]:      http(),
      [polygon.id]:   http(),
      [arbitrum.id]:  http(),
      [avalanche.id]: http(),
    },
  })
}

// Use globalThis so the same instance survives HMR module re-evaluation
const g = globalThis as typeof globalThis & { __mwWagmiConfig?: ReturnType<typeof makeConfig> }
if (!g.__mwWagmiConfig) g.__mwWagmiConfig = makeConfig()
export const wagmiConfig = g.__mwWagmiConfig
