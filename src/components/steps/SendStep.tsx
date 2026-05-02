import React, { useState, useEffect } from 'react'
import QRCode from 'react-qr-code'
import { Button } from '../ui/Button'
import type { OrderState, EthProvider } from '../../types'

const SEND_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

// Token contract addresses keyed by "token:network"
const TOKEN_CONTRACTS: Record<string, string> = {
  'usdc:base':      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'usdc:arbitrum':  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'usdc:ethereum':  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'usdc:avalanche': '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6C',
  'usdc:polygon':   '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  'usdt:ethereum':  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
}

const CHAIN_IDS: Record<string, string> = {
  base:      '0x2105',
  arbitrum:  '0xa4b1',
  ethereum:  '0x1',
  avalanche: '0xa86a',
  polygon:   '0x89',
}

// Encode ERC-20 transfer(address,uint256) call data without any library
function encodeErc20Transfer(toAddress: string, amountHex: string): string {
  const selector = 'a9059cbb'
  const paddedAddr = toAddress.replace('0x', '').toLowerCase().padStart(64, '0')
  const paddedAmt  = amountHex.replace('0x', '').padStart(64, '0')
  return `0x${selector}${paddedAddr}${paddedAmt}`
}

type WalletTxStatus = 'idle' | 'switching' | 'pending' | 'success' | 'error'

interface SendStepProps {
  orderState: Partial<OrderState>
  onSuccess?: (transferId: string) => void
  onBack?: () => void
  onTimeout?: () => void
  connectedEvmAddress?: string
  connectedSolanaAddress?: string
  evmProvider?: EthProvider
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  return (
    <svg
      className="h-4 w-4 text-gray-400 group-hover:text-gray-700"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

export function SendStep({
  orderState,
  onSuccess,
  onBack,
  onTimeout,
  connectedEvmAddress,
  evmProvider,
}: SendStepProps) {
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedAmount, setCopiedAmount] = useState(false)
  const [copiedTxId, setCopiedTxId] = useState(false)
  const [done, setDone] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [walletTxStatus, setWalletTxStatus] = useState<WalletTxStatus>('idle')
  const [walletTxHash, setWalletTxHash] = useState<string | null>(null)
  const [walletTxError, setWalletTxError] = useState<string | null>(null)

  // Auto-cancel the transfer if the user idles for 5 minutes without sending
  useEffect(() => {
    if (done) return
    const timer = setTimeout(() => {
      if (onTimeout) onTimeout()
    }, SEND_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [done, onTimeout])

  // Auto-advance to done screen 1.5 s after wallet tx is confirmed
  useEffect(() => {
    if (walletTxStatus !== 'success') return
    const t = setTimeout(() => setDone(true), 1500)
    return () => clearTimeout(t)
  }, [walletTxStatus])

  const {
    transferId,
    depositAddress,
    transferAmount,
    transferStatus,
    transferStatusLabel,
    sourceToken = 'usdc',
    sourceNetwork = 'base',
  } = orderState

  const networkLabel =
    sourceNetwork === 'arbitrum'  ? 'Arbitrum' :
    sourceNetwork === 'avalanche' ? 'Avalanche' :
    sourceNetwork === 'base'      ? 'Base' :
    sourceNetwork === 'ethereum'  ? 'Ethereum' :
    sourceNetwork === 'polygon'   ? 'Polygon' :
    sourceNetwork === 'solana'    ? 'Solana' :
    sourceNetwork === 'tron'      ? 'Tron' :
    sourceNetwork
  const tokenLabel = sourceToken.toUpperCase()

  const isEvmNetwork     = sourceNetwork !== 'solana' && sourceNetwork !== 'tron'
  const tokenContract    = TOKEN_CONTRACTS[`${sourceToken}:${sourceNetwork}`]
  const chainId          = CHAIN_IDS[sourceNetwork]
  const evmWalletReady   = isEvmNetwork && !!connectedEvmAddress && !!tokenContract && !!chainId

  function copyToClipboard(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setter(true)
      setTimeout(() => setter(false), 2000)
    })
  }

  /** Detects WalletConnect v2 stale/expired session errors by message substring */
  function isStaleSessionError(msg: string): boolean {
    return (
      msg.includes('session topic') ||
      msg.includes('no matching key') ||
      msg.includes('session does not exist') ||
      msg.includes('matching peer id') ||
      msg.includes('request() method')
    )
  }

  async function sendFromWallet() {
    setWalletTxError(null)
    setWalletTxStatus('switching')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = evmProvider ?? (window as any).ethereum
    if (!eth) {
      setWalletTxError('Wallet not found. Please reconnect and try again.')
      setWalletTxStatus('error')
      return
    }

    if (!depositAddress || transferAmount == null) {
      setWalletTxError('Missing transfer details.')
      setWalletTxStatus('error')
      return
    }

    // Switch to the correct network
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string }
      const msg = (e?.message ?? '').toLowerCase()
      if (isStaleSessionError(msg)) {
        setWalletTxError('Wallet session expired. Please disconnect and reconnect your wallet.')
        setWalletTxStatus('error')
        return
      }
      if (e?.code !== 4902) {
        // 4902 = chain not added to wallet — attempt send anyway
        setWalletTxError('Network switch rejected. Please switch to ' + networkLabel + ' manually and retry.')
        setWalletTxStatus('error')
        return
      }
    }

    setWalletTxStatus('pending')

    try {
      // USDC has 6 decimal places
      const usdcUnits = BigInt(Math.round(transferAmount * 1_000_000))
      const data = encodeErc20Transfer(depositAddress, usdcUnits.toString(16))

      const txHash: string = await eth.request({
        method: 'eth_sendTransaction',
        params: [{
          from: connectedEvmAddress,
          to:   tokenContract,
          data,
          value: '0x0',
        }],
      })

      setWalletTxHash(txHash)
      setWalletTxStatus('success')
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string }
      const msg = (e?.message ?? '').toLowerCase()
      if (e?.code === 4001) {
        setWalletTxError('Transaction rejected.')
      } else if (isStaleSessionError(msg)) {
        setWalletTxError('Wallet session expired. Please disconnect and reconnect your wallet.')
      } else {
        setWalletTxError(e?.message ?? 'Transaction failed. Please try again.')
      }
      setWalletTxStatus('error')
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────────
  if (done && transferId) {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transfer Submitted</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Once we detect your deposit, your payout will be processed automatically.
          </p>
        </div>

        {walletTxHash && (
          <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/20 p-3">
            <p className="mb-1 text-xs font-semibold text-green-800 dark:text-green-300">On-chain transaction</p>
            <p className="break-all font-mono text-xs text-green-700 dark:text-green-400">{walletTxHash}</p>
          </div>
        )}

        <div className="rounded-xl border border-blue-200 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-900/20 p-4">
          <p className="mb-1 text-sm font-semibold text-blue-800 dark:text-blue-300">Save your Transfer ID</p>
          <p className="mb-3 text-xs text-blue-700 dark:text-blue-400">
            Use this ID to monitor your transaction status. You can check it at any time on the main screen.
          </p>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 dark:border-blue-700/50 bg-white dark:bg-gray-800 px-3 py-2">
            <p className="flex-1 truncate font-mono text-xs text-gray-800 dark:text-gray-200">{transferId}</p>
            <button
              type="button"
              onClick={() => copyToClipboard(transferId, setCopiedTxId)}
              className="group flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            >
              <CopyIcon copied={copiedTxId} />
              <span>{copiedTxId ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <div className="flex gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Transfers typically complete within a few hours. Paste your Transfer ID into the
            &quot;Check a previous transfer&quot; box on the main screen to see the latest status.
          </p>
        </div>

        <Button variant="primary" fullWidth onClick={() => onSuccess && onSuccess(transferId)}>
          Start New Transfer
        </Button>
      </div>
    )
  }

  // ── Send screen ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
          <svg className="h-7 w-7 text-[#ef5200]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Send Your {tokenLabel}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Transfer the exact amount below to complete your payout.
        </p>
      </div>

      {/* Amount to send */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Amount to send</p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {transferAmount != null ? `$${(Math.floor(transferAmount * 100) / 100).toFixed(2)} USD` : '—'}
          </span>
          {transferAmount != null && (
            <button
              type="button"
              onClick={() => copyToClipboard(String(transferAmount), setCopiedAmount)}
              className="group flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <CopyIcon copied={copiedAmount} />
              <span>{copiedAmount ? 'Copied!' : 'Copy'}</span>
            </button>
          )}
        </div>
        {transferStatusLabel && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{transferStatusLabel}</p>
        )}
      </div>

      {/* ── Wallet send (EVM only) ─────────────────────────────────────────── */}
      {evmWalletReady && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-900/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Wallet connected</p>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Your wallet is connected on {networkLabel}. Click below to send{' '}
            {transferAmount != null ? `$${(Math.floor(transferAmount * 100) / 100).toFixed(2)} USDC` : 'the amount'}{' '}
            directly — no copying required.
          </p>

          {walletTxStatus === 'success' ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-100 dark:bg-green-900/30 px-3 py-2">
              <svg className="h-4 w-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs font-semibold text-green-800 dark:text-green-300">Transaction submitted! Completing…</p>
            </div>
          ) : (
            <Button
              variant="primary"
              fullWidth
              loading={walletTxStatus === 'switching' || walletTxStatus === 'pending'}
              onClick={sendFromWallet}
            >
              {walletTxStatus === 'switching' ? 'Switching network…' :
               walletTxStatus === 'pending'   ? 'Confirm in wallet…' :
               `Send ${transferAmount != null ? `$${(Math.floor(transferAmount * 100) / 100).toFixed(2)}` : ''} USDC`}
            </Button>
          )}

          {walletTxError && (
            <p className="text-xs text-red-600">{walletTxError}</p>
          )}

          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="text-xs text-gray-400 dark:text-gray-500 underline hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {showManual ? 'Hide manual send' : 'Send manually instead'}
          </button>
        </div>
      )}

      {/* ── Manual send (always shown when no EVM wallet; collapsible otherwise) ── */}
      {(!evmWalletReady || showManual) && depositAddress && (
        <div className="space-y-3">
          {/* Deposit address */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Deposit address ({networkLabel} network)
            </p>
            <div className="flex justify-center rounded-xl border border-gray-200 dark:border-gray-600 bg-white p-5">
              <QRCode
                value={depositAddress}
                size={180}
                bgColor="#ffffff"
                fgColor="#111827"
                level="M"
              />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-orange-300 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-900/20 px-4 py-3">
              <span className="flex-1 break-all font-mono text-xs text-gray-900 dark:text-gray-100">{depositAddress}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(depositAddress, setCopiedAddress)}
                className="group flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[#ef5200] transition-colors hover:bg-orange-100 hover:text-[#fa4536]"
              >
                <CopyIcon copied={copiedAddress} />
                <span>{copiedAddress ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {(!evmWalletReady || showManual) && !depositAddress && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Deposit address will be shown here. If you don&apos;t see it, please contact support with
            your transfer ID.
          </p>
        </div>
      )}

      {/* Warning */}
      <div className="flex gap-3 rounded-xl border border-yellow-300 dark:border-yellow-700/50 bg-yellow-50 dark:bg-yellow-900/20 p-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <p className="text-xs text-yellow-800 dark:text-yellow-300">
          Send <strong>only {tokenLabel} on {networkLabel}</strong> to this address. Sending other
          tokens or using a different network will result in permanent loss of funds.
        </p>
      </div>

      {/* Transfer ID + reference */}
      {transferId && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-2">
          <div>
            <p className="mb-1 text-xs text-gray-400 dark:text-gray-500">Transfer ID (save for reference)</p>
            <div className="flex items-center justify-between gap-2">
              <p className="flex-1 truncate font-mono text-xs text-gray-600 dark:text-gray-400">{transferId}</p>
              <button
                type="button"
                onClick={() => copyToClipboard(transferId, setCopiedTxId)}
                className="group flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 dark:text-gray-500 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <CopyIcon copied={copiedTxId} />
                <span>{copiedTxId ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
          {transferStatus && (
            <div>
              <p className="mb-0.5 text-xs text-gray-400 dark:text-gray-500">Status</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{transferStatusLabel ?? transferStatus}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions — only shown when not using wallet send */}
      {(!evmWalletReady || showManual) && (
        <div className="flex gap-3">
          {onBack && (
            <Button variant="secondary" onClick={onBack} className="flex-1">
              Back
            </Button>
          )}
          <Button variant="primary" onClick={() => setDone(true)} className="flex-1">
            I&apos;ve Sent the Funds
          </Button>
        </div>
      )}

      {/* Back only (when using wallet send) */}
      {evmWalletReady && !showManual && onBack && (
        <Button variant="secondary" onClick={onBack} fullWidth>
          Back
        </Button>
      )}
    </div>
  )
}


