import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Spinner } from '../ui/Spinner'
import { getQuote, getDepositOptions } from '../../api/client'
import type { OrderState, QuoteResponse, DepositOption } from '../../types'

const CURRENCIES = [
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'BDT', label: 'BDT — Bangladeshi Taka' },
  { value: 'BGN', label: 'BGN — Bulgarian Lev' },
  { value: 'BRL', label: 'BRL — Brazilian Real' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'CZK', label: 'CZK — Czech Koruna' },
  { value: 'DKK', label: 'DKK — Danish Krone' },
  { value: 'EGP', label: 'EGP — Egyptian Pound' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'GHS', label: 'GHS — Ghanaian Cedi' },
  { value: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { value: 'HRK', label: 'HRK — Croatian Kuna' },
  { value: 'HUF', label: 'HUF — Hungarian Forint' },
  { value: 'IDR', label: 'IDR — Indonesian Rupiah' },
  { value: 'ILS', label: 'ILS — Israeli Shekel' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'KES', label: 'KES — Kenyan Shilling' },
  { value: 'LKR', label: 'LKR — Sri Lankan Rupee' },
  { value: 'MAD', label: 'MAD — Moroccan Dirham' },
  { value: 'MXN', label: 'MXN — Mexican Peso' },
  { value: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { value: 'NGN', label: 'NGN — Nigerian Naira' },
  { value: 'NOK', label: 'NOK — Norwegian Krone' },
  { value: 'NPR', label: 'NPR — Nepalese Rupee' },
  { value: 'NZD', label: 'NZD — New Zealand Dollar' },
  { value: 'PHP', label: 'PHP — Philippine Peso' },
  { value: 'PKR', label: 'PKR — Pakistani Rupee' },
  { value: 'PLN', label: 'PLN — Polish Złoty' },
  { value: 'RON', label: 'RON — Romanian Leu' },
  { value: 'RWF', label: 'RWF — Rwandan Franc' },
  { value: 'SAR', label: 'SAR — Saudi Riyal' },
  { value: 'SEK', label: 'SEK — Swedish Krona' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'THB', label: 'THB — Thai Baht' },
  { value: 'TRY', label: 'TRY — Turkish Lira' },
  { value: 'TZS', label: 'TZS — Tanzanian Shilling' },
  { value: 'UGX', label: 'UGX — Ugandan Shilling' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'VND', label: 'VND — Vietnamese Dong' },
  { value: 'XOF', label: 'XOF — West African CFA Franc' },
  { value: 'ZAR', label: 'ZAR — South African Rand' },
]

function calcTxFee(amount: number): number {
  return amount < 1000 ? 2 : 3
}

function floorTwo(n: number): string {
  return (Math.floor(n * 100) / 100).toFixed(2)
}

interface AmountStepProps {
  initialState: Partial<OrderState>
  onNext: (data: Partial<OrderState>) => void
  onSessionExpired: () => void
}

export function AmountStep({ initialState, onNext, onSessionExpired }: AmountStepProps) {
  const [amountStr, setAmountStr] = useState(
    initialState.amount != null ? String(initialState.amount) : '',
  )
  const [currency, setCurrency] = useState(initialState.currency ?? 'EUR')
  const [quote, setQuote] = useState<QuoteResponse | null>(
    initialState.quote ?? null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [amountError, setAmountError] = useState<string | null>(null)

  // Deposit token/network selection
  const [depositOptions, setDepositOptions] = useState<DepositOption[]>([])
  const [selectedOption, setSelectedOption] = useState<DepositOption | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch deposit options once on mount
  useEffect(() => {
    getDepositOptions()
      .then((opts) => {
        setDepositOptions(opts)
        // Restore previous selection or default to first option
        if (opts.length > 0) {
          const restored = initialState.sourceToken && initialState.sourceNetwork
            ? opts.find(
                (o) => o.token === initialState.sourceToken && o.network === initialState.sourceNetwork,
              ) ?? opts[0]
            : opts[0]
          setSelectedOption(restored)
        }
      })
      .catch(() => {
        // Non-fatal — user can still proceed without token picker
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchQuote = useCallback(
    async (usd: number, cur: string) => {
      setLoading(true)
      setError(null)
      try {
        const q = await getQuote(cur, usd)
        setQuote(q)
      } catch (err) {
        setQuote(null)
        const e = err as Error & { status?: number }
        if (e.status === 401) { onSessionExpired(); return }
        setError(e.message || 'Failed to fetch quote')
      } finally {
        setLoading(false)
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    const usd = parseFloat(amountStr)
    if (!amountStr || isNaN(usd) || usd <= 0) {
      setQuote(null)
      setError(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void fetchQuote(usd, currency)
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [amountStr, currency, fetchQuote])

  function validateAmount(): boolean {
    const usd = parseFloat(amountStr)
    if (!amountStr || isNaN(usd) || usd <= 0) {
      setAmountError('Enter a valid amount')
      return false
    }
    if (!/^\d+(\.\d{0,2})?$/.test(amountStr)) {
      setAmountError('Max 2 decimal places')
      return false
    }
    const txFee = calcTxFee(usd)
    if (usd <= txFee) {
      setAmountError(`Amount must exceed the $${txFee} network fee`)
      return false
    }
    setAmountError(null)
    return true
  }

  function handleContinue() {
    if (!validateAmount()) return
    if (!quote) return
    const usd = parseFloat(amountStr)
    onNext({
      amount: usd,
      currency,
      quoteId: quote.quoteId,
      quote,
      sourceToken: selectedOption?.token ?? 'usdc',
      sourceNetwork: selectedOption?.network ?? 'base',
    })
  }

  const usd = parseFloat(amountStr)
  const isValidAmount = !isNaN(usd) && usd > 0
  const txFee = isValidAmount ? (quote?.txFee ?? calcTxFee(usd)) : 0
  const canContinue = !loading && !error && quote !== null && !amountError

  const balanceOption = quote?.quote.paymentOptions?.find(
    (o) => o.payIn === 'BALANCE' && !o.disabled,
  )
  const wiseFee =
    balanceOption?.price?.total?.value?.amount ??
    balanceOption?.fee?.total ??
    (quote?.quote.fee?.total ?? null)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Send Money</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Enter the amount you want to send and choose the recipient currency.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Amount (USD)"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="100.00"
          value={amountStr}
          onChange={(e) => {
            setAmountStr(e.target.value)
            setAmountError(null)
          }}
          error={amountError ?? undefined}
          required
        />
        <Select
          label="Recipient Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={CURRENCIES}
          required
        />
      </div>

      {/* Token / network picker */}
      {depositOptions.length > 0 && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            You will send
          </label>
          <div className="flex flex-wrap gap-2">
            {depositOptions.map((opt) => {
              const key = `${opt.token}:${opt.network}`
              const selKey = selectedOption ? `${selectedOption.token}:${selectedOption.network}` : ''
              const isSelected = key === selKey
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedOption(opt)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Quote breakdown */}
      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          <Spinner size={16} />
          <span>Fetching quote…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && quote && (
        <div className="space-y-0 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-gray-500">Network fee</span>
            <span className="font-medium text-gray-900">${floorTwo(txFee)}</span>
          </div>

          {wiseFee != null && (
            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-500">Wise transfer fee</span>
              <span className="font-medium text-gray-900">
                {floorTwo(wiseFee)} {quote.quote.source}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-gray-500">Exchange rate</span>
            <span className="font-medium text-gray-900">
              1 USD ≈ {quote.bridgeRate} EUR ≈{' '}
              {floorTwo(quote.quote.rate)} {quote.quote.target}
            </span>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-gray-500">You send</span>
            <span className="font-semibold text-gray-900">
              ${floorTwo(usd)} {selectedOption ? selectedOption.tokenLabel : 'USDC'}
            </span>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="font-medium text-gray-700">Recipient gets</span>
            <span className="font-semibold text-orange-600">
              {floorTwo(quote.quote.targetAmount)} {quote.quote.target}
            </span>
          </div>

          {balanceOption?.estimatedDelivery && (
            <div className="px-4 py-2.5">
              <p className="text-xs text-gray-400">
                Estimated delivery:{' '}
                {new Date(balanceOption.estimatedDelivery).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}
        </div>
      )}

      <Button
        variant="primary"
        fullWidth
        onClick={handleContinue}
        disabled={!canContinue}
        loading={loading}
      >
        Continue
      </Button>
    </div>
  )
}
