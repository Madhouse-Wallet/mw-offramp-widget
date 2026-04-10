import React, { useState } from 'react'
import { Button } from '../ui/Button'
import { createTransfer } from '../../api/client'
import type { OrderState } from '../../types'

function floorTwo(n: number): string {
  return (Math.floor(n * 100) / 100).toFixed(2)
}

function formatDelivery(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

interface ConfirmStepProps {
  orderState: Partial<OrderState>
  onNext: (data: Partial<OrderState>) => void
  onBack: () => void
  onSessionExpired: () => void
}

interface SummaryRowProps {
  label: React.ReactNode
  value: React.ReactNode
  highlight?: boolean
}

function SummaryRow({ label, value, highlight = false }: SummaryRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right font-medium ${highlight ? 'text-orange-600' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}

export function ConfirmStep({ orderState, onNext, onBack, onSessionExpired }: ConfirmStepProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    amount = 0,
    currency = 'EUR',
    quoteId,
    quote,
    recipientId,
    recipientName,
    recipientType,
    sourceToken,
    sourceNetwork,
    userEmail,
    walletAddress,
    connectedChainId: _connectedChainId,
  } = orderState

  const networkLabel = sourceNetwork
    ? sourceNetwork.charAt(0).toUpperCase() + sourceNetwork.slice(1)
    : null

  const shortenAddress = (addr: string) =>
    addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr

  const delivery = formatDelivery(quote?.quote.estimatedDelivery)

  async function handleConfirm() {
    if (!quoteId || !recipientId || !amount || !walletAddress) {
      setError('Missing required data. Please go back and try again.')
      return
    }

    setSubmitting(true)
    setError(null)

    const customerUuid = crypto.randomUUID()

    try {
      const response = await createTransfer({
        quote_id: quoteId,
        amount,
        recipientId,
        customer_uuid: customerUuid,
        customer_email: userEmail ?? '',
        source_token: sourceToken ?? 'usdc',
        source_network: sourceNetwork ?? 'base',
        ...(walletAddress ? { wallet_address: walletAddress } : {}),
      })
      const t = response.transfer
      onNext({
        customerId: customerUuid,
        transferId: t.id,
        depositAddress: t.deposit_address ?? undefined,
        transferStatus: t.status,
        transferStatusLabel: t.status_label,
        transferReference: t.reference,
        transferAmount: t.amount,
        transferCurrency: t.currency ?? undefined,
        sourceToken: t.sourceToken ?? undefined,
        sourceNetwork: t.sourceNetwork ?? undefined,
      })
    } catch (err) {
      const e = err as Error & { transfer_id?: string; status?: number }
      if (e.status === 401) { onSessionExpired(); return }
      if (e.status === 409 && e.transfer_id) {
        onNext({
          customerId: customerUuid,
          transferId: e.transfer_id,
        })
      } else {
        setError(e.message || 'Failed to initiate transfer')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Review Order</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Confirm the details before sending.
        </p>
      </div>

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50">
        <SummaryRow label="You send" value={`$${floorTwo(amount)} ${(sourceToken ?? 'usdc').toUpperCase()}`} />

        {quote && (
          <>
            {quote.serviceFee > 0 && (
              <SummaryRow
                label={`Service fee (${floorTwo(quote.serviceFeePercent)}%)`}
                value={`−$${floorTwo(quote.serviceFee)}`}
              />
            )}
            {quote.quote.transferFee != null && (
              <SummaryRow
                label="Transfer fee"
                value={`−$${floorTwo(quote.quote.transferFee)}`}
              />
            )}
            <SummaryRow
              label="Exchange rate"
              value={`1 USD ≈ ${floorTwo(quote.usdToTargetRate)} ${quote.targetCurrency}`}
            />
          </>
        )}

        {walletAddress && (
          <SummaryRow
            label="From wallet"
            value={
              <span>
                <span className="block font-mono text-xs">{shortenAddress(walletAddress)}</span>
                {networkLabel && (
                  <span className="text-xs text-gray-400">
                    {(orderState.sourceToken ?? 'usdc').toUpperCase()} on {networkLabel}
                  </span>
                )}
              </span>
            }
          />
        )}

        {recipientName && (
          <SummaryRow
            label="Recipient"
            value={
              <span>
                <span className="block">{recipientName}</span>
                <span className="text-xs text-gray-400">
                  {currency} · {recipientType}
                </span>
              </span>
            }
          />
        )}

        {delivery && <SummaryRow label="Estimated delivery" value={delivery} />}

        {quote && quote.quote.targetAmount != null && (
          <SummaryRow
            label="Recipient gets"
            value={`${floorTwo(quote.quote.targetAmount)} ${quote.targetCurrency}`}
            highlight
          />
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} disabled={submitting} className="flex-1">
          Back
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleConfirm()}
          loading={submitting}
          className="flex-1"
        >
          Confirm & Get Deposit Address
        </Button>
      </div>
    </div>
  )
}
