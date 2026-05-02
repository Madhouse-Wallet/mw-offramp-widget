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
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-right font-medium ${highlight ? 'text-[#ef5200]' : 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </span>
    </div>
  )
}

// Fields that are structural/internal and should not be shown to the user
const HIDDEN_DETAIL_KEYS = new Set(['legalType', 'address'])

// camelCase / PascalCase → "Human Label"
function prettifyKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

// Mask sensitive fields — show only last 4 chars padded with bullets
function maskValue(key: string, value: string): string {
  const sensitive = /account|iban|rtn|abartn|bsb|clabe|cnaps|ifsc/i.test(key)
  if (sensitive && value.length > 4) {
    return `••••${value.slice(-4)}`
  }
  return value
}

function formatDetails(details: Record<string, unknown>): Array<{ label: string; value: string }> {
  return Object.entries(details)
    .filter(([k, v]) => !HIDDEN_DETAIL_KEYS.has(k) && typeof v === 'string' && v.trim() !== '')
    .map(([k, v]) => ({
      label: prettifyKey(k),
      value: maskValue(k, v as string),
    }))
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
    recipientDetails,
    sourceToken,
    sourceNetwork,
    userEmail,
    walletAddress,
  } = orderState

  const formattedDetails = recipientDetails ? formatDetails(recipientDetails) : []

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
        wallet_address: walletAddress,
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
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Review Order</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Confirm the details before sending.
        </p>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <SummaryRow label="You send" value={`$${floorTwo(amount)} USD`} />

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

        {recipientName && (
          <SummaryRow
            label="Recipient"
            value={
              <span>
                <span className="block">{recipientName}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {currency} · {recipientType}
                </span>
                {formattedDetails.map((d) => (
                  <span key={d.label} className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">
                    {d.label}: {d.value}
                  </span>
                ))}
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
        <div className="rounded-xl border border-red-200 dark:border-red-700/50 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300">
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
