import React, { useState } from 'react'
import { Button } from '../ui/Button'
import type { OrderState } from '../../types'

interface SendStepProps {
  orderState: Partial<OrderState>
  onSuccess?: (transferId: string) => void
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

export function SendStep({ orderState, onSuccess }: SendStepProps) {
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedAmount, setCopiedAmount] = useState(false)
  const [copiedTxId, setCopiedTxId] = useState(false)

  const {
    transferId,
    depositAddress,
    depositAmount,
    depositCurrency = 'USDC',
    sourceToken = 'usdc',
    sourceNetwork = 'base',
  } = orderState

  // Human-readable network label for the warning and address label
  const networkLabel =
    sourceNetwork === 'arbitrum' ? 'Arbitrum' :
    sourceNetwork === 'base' ? 'Base' :
    sourceNetwork === 'ethereum' ? 'Ethereum' :
    sourceNetwork === 'optimism' ? 'Optimism' :
    sourceNetwork === 'polygon' ? 'Polygon' :
    sourceNetwork === 'solana' ? 'Solana' :
    sourceNetwork
  const tokenLabel = sourceToken.toUpperCase()

  function copyToClipboard(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setter(true)
      setTimeout(() => setter(false), 2000)
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100">
          <svg
            className="h-7 w-7 text-orange-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Send Your {tokenLabel}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Transfer the exact amount below to complete your payout.
        </p>
      </div>

      {/* Amount to send */}
      {depositAmount && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
            Amount to send
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-gray-900">
              {depositAmount} {depositCurrency}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(depositAmount, setCopiedAmount)}
              className="group flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
            >
              <CopyIcon copied={copiedAmount} />
              <span>{copiedAmount ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Deposit address */}
      {depositAddress ? (
        <div className="rounded-xl border border-orange-300 bg-orange-50 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
            Deposit address ({networkLabel} network)
          </p>
          <div className="flex items-start gap-3">
            <p className="flex-1 break-all font-mono text-sm text-gray-900">{depositAddress}</p>
            <button
              type="button"
              onClick={() => copyToClipboard(depositAddress, setCopiedAddress)}
              className="group mt-0.5 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-orange-100 hover:text-gray-900"
            >
              <CopyIcon copied={copiedAddress} />
              <span>{copiedAddress ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-500">
            Deposit address will be shown here. If you don't see it, please contact support with
            your transfer ID.
          </p>
        </div>
      )}

      {/* Warning */}
      <div className="flex gap-3 rounded-xl border border-yellow-300 bg-yellow-50 p-3">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-xs text-yellow-800">
          Send <strong>only {tokenLabel} on {networkLabel}</strong> to this address. Sending other
          tokens or using a different network will result in permanent loss of funds.
        </p>
      </div>

      {/* Transfer ID reference */}
      {transferId && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-1 text-xs text-gray-400">Transfer ID (save for reference)</p>
          <div className="flex items-center justify-between gap-2">
            <p className="flex-1 truncate font-mono text-xs text-gray-600">{transferId}</p>
            <button
              type="button"
              onClick={() => copyToClipboard(transferId, setCopiedTxId)}
              className="group flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-900"
            >
              <CopyIcon copied={copiedTxId} />
              <span>{copiedTxId ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Done button */}
      <Button
        variant="primary"
        fullWidth
        onClick={() => onSuccess && transferId ? onSuccess(transferId) : undefined}
      >
        Done
      </Button>

    </div>
  )
}
