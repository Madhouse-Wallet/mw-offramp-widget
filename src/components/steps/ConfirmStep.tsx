import React, { useState } from 'react'
import { Button } from '../ui/Button'
import { createTransfer } from '../../api/client'
import type { OrderState, WisePaymentOption } from '../../types'

function floorTwo(n: number): string {
  return (Math.floor(n * 100) / 100).toFixed(2)
}

function calcTxFee(amount: number): number {
  return amount < 1000 ? 2 : 3
}

function getEstimatedDelivery(options?: WisePaymentOption[]): string | null {
  const opt = options?.find((o) => o.payIn === 'BALANCE' && !o.disabled)
  if (!opt?.estimatedDelivery) return null
  return new Date(opt.estimatedDelivery).toLocaleDateString(undefined, {
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
  } = orderState

  const txFee = quote?.txFee ?? calcTxFee(amount)
  const delivery = getEstimatedDelivery(quote?.quote.paymentOptions)

  async function handleConfirm() {
    if (!quoteId || !recipientId || !amount) {
      setError('Missing required data. Please go back and try again.')
      return
    }

    setSubmitting(true)
    setError(null)

    const customerUuid = crypto.randomUUID()

    try {
      const transfer = await createTransfer({
        quote_id: quoteId,
        amount,
        recipientId,
        customer_uuid: customerUuid,
        customer_email: userEmail ?? '',
        ...(sourceToken ? { source_token: sourceToken } : {}),
        ...(sourceNetwork ? { source_network: sourceNetwork } : {}),
      })
      onNext({
        customerId: customerUuid,
        transferId: transfer.transfer_id,
        depositAddress: transfer.deposit_address,
        depositAmount: transfer.amount,
        depositCurrency: transfer.currency,
      })
    } catch (err) {
      const e = err as Error & { transfer_id?: string; status?: number }
      if (e.status === 401) { onSessionExpired(); return }
      if (e.status === 409 && e.transfer_id) {
        onNext({
          customerId: customerUuid,
          transferId: e.transfer_id,
          depositAddress: undefined,
          depositAmount: String(amount),
          depositCurrency: 'USDC',
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
        <SummaryRow label="You send" value={`$${floorTwo(amount)} USD`} />
        <SummaryRow label="Network fee" value={`$${floorTwo(txFee)}`} />

        {quote && (
          <>
            <SummaryRow
              label="Exchange rate"
              value={currency === 'EUR'
                ? `1 USD ≈ ${quote.bridgeRate} EUR`
                : `1 USD ≈ ${floorTwo(parseFloat(quote.bridgeRate) * quote.quote.rate)} ${currency}`}
            />
            {quote.quote.fee?.total != null && (
              <SummaryRow
                label="Wise fee"
                value={`${floorTwo(quote.quote.fee.total)} ${quote.quote.source}`}
              />
            )}
          </>
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

        {quote && (
          <SummaryRow
            label="Recipient gets"
            value={`${floorTwo(quote.quote.targetAmount)} ${currency}`}
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
