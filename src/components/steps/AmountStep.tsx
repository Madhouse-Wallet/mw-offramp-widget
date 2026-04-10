import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { CurrencySelect } from '../ui/CurrencySelect'
import { Spinner } from '../ui/Spinner'
import { getQuote, getTransferStatus, getAmountLimits, executeCaptcha, verifyCaptchaToken } from '../../api/client'
import { NETWORK_TO_SOURCE_TOKENS } from '../../lib/wallet-config'
import type { OrderState, QuoteResponse, TransferRecord, RecipientSnapshot, TransferQuoteSnapshot } from '../../types'

// ─── Transfer status card ─────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: string; label: string }) {
  const color =
    status === 'completed' ? 'bg-green-100 text-green-700 ring-green-200' :
    status === 'failed'    ? 'bg-red-100 text-red-700 ring-red-200' :
                             'bg-orange-100 text-orange-700 ring-orange-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${color}`}>
      {label}
    </span>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-gray-500">{label}</span>
      <span className="text-right text-xs font-medium text-gray-900 break-all">{value}</span>
    </div>
  )
}

function ExpandSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1"
      >
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="divide-y divide-gray-100 border-t border-gray-200 px-3">
          {children}
        </div>
      )}
    </div>
  )
}

function RecipientSection({ recipient }: { recipient: RecipientSnapshot }) {
  return (
    <ExpandSection title="Recipient">
      <DetailRow label="Name" value={recipient.accountHolderName} />
      <DetailRow label="Currency" value={recipient.currency} />
      <DetailRow label="Account type" value={recipient.type.toUpperCase()} />
      {recipient.country && <DetailRow label="Country" value={recipient.country} />}
      {Object.entries(recipient.details)
        .filter(([key, val]) => val != null && val !== '' && !key.toLowerCase().includes('address'))
        .map(([key, val]) => (
          <DetailRow
            key={key}
            label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
            value={String(val)}
          />
        ))}
    </ExpandSection>
  )
}

function QuoteSection({ quote }: { quote: TransferQuoteSnapshot }) {
  return (
    <ExpandSection title="Quote details">
      <DetailRow label="You sent" value={`$${floorTwo(quote.sourceAmount)} USD`} />
      {quote.serviceFee > 0 && (
        <DetailRow
          label={`Service fee (${floorTwo(quote.serviceFeePercent)}%)`}
          value={`−$${floorTwo(quote.serviceFee)}`}
        />
      )}
      <DetailRow label="Net converted" value={`$${floorTwo(quote.netUsdAmount)} USD`} />
      {quote.transferFee != null && (
        <DetailRow label="Transfer fee" value={`−$${floorTwo(quote.transferFee)}`} />
      )}
      <DetailRow
        label="Exchange rate"
        value={`1 USD ≈ ${(Math.floor(quote.usdToTargetRate * 10000) / 10000).toFixed(4)} ${quote.targetCurrency}`}
      />
      {quote.targetAmount != null && (
        <DetailRow
          label="Recipient gets"
          value={`${floorTwo(quote.targetAmount)} ${quote.targetCurrency}`}
        />
      )}
      {quote.estimatedDelivery && (
        <DetailRow
          label="Est. delivery"
          value={new Date(quote.estimatedDelivery).toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
          })}
        />
      )}
    </ExpandSection>
  )
}

function TransferStatusCard({ transfer }: { transfer: TransferRecord }) {
  return (
    <div
      className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-white p-3"
      role="region"
      aria-label="Transfer status"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700">Transfer status</span>
        <StatusBadge status={transfer.status} label={transfer.status_label} />
      </div>

      {/* Core fields */}
      <div className="divide-y divide-gray-100">
        <DetailRow label="Transfer ID" value={<span className="font-mono">{transfer.id}</span>} />
        <DetailRow label="Amount" value={`$${floorTwo(transfer.amount)} USD`} />
        {transfer.currency && (
          <DetailRow label="Target currency" value={transfer.currency} />
        )}
        {transfer.sourceToken && transfer.sourceNetwork && (
          <DetailRow
            label="Sent via"
            value={`${transfer.sourceToken.toUpperCase()} on ${transfer.sourceNetwork.charAt(0).toUpperCase() + transfer.sourceNetwork.slice(1)}`}
          />
        )}
        {transfer.customerEmail && (
          <DetailRow label="Notification email" value={transfer.customerEmail} />
        )}
        <DetailRow
          label="Created"
          value={new Date(transfer.timestamp).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        />
        <DetailRow
          label="Last updated"
          value={new Date(transfer.updated_at ?? transfer.timestamp).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        />
        {transfer.error && (
          <DetailRow label="Error" value={<span className="text-red-600">{transfer.error}</span>} />
        )}
      </div>

      {/* Expandable sections */}
      {transfer.recipient && <RecipientSection recipient={transfer.recipient} />}
      {transfer.quote && <QuoteSection quote={transfer.quote} />}
    </div>
  )
}

const CURRENCIES = [
  { value: 'AED', label: 'AED — UAE Dirham',              flag: '🇦🇪' },
  { value: 'ALL', label: 'ALL — Albanian Lek',            flag: '🇦🇱' },
  { value: 'ARS', label: 'ARS — Argentine Peso',          flag: '🇦🇷' },
  { value: 'AUD', label: 'AUD — Australian Dollar',       flag: '🇦🇺' },
  { value: 'BAM', label: 'BAM — Bosnia-Herzegovina Mark', flag: '🇧🇦' },
  { value: 'BDT', label: 'BDT — Bangladeshi Taka',        flag: '🇧🇩' },
  { value: 'BGN', label: 'BGN — Bulgarian Lev',           flag: '🇧🇬' },
  { value: 'BHD', label: 'BHD — Bahraini Dinar',          flag: '🇧🇭' },
  { value: 'BMD', label: 'BMD — Bermudian Dollar',        flag: '🇧🇲' },
  { value: 'BOB', label: 'BOB — Bolivian Boliviano',      flag: '🇧🇴' },
  { value: 'BRL', label: 'BRL — Brazilian Real',          flag: '🇧🇷' },
  { value: 'BWP', label: 'BWP — Botswanan Pula',          flag: '🇧🇼' },
  { value: 'CAD', label: 'CAD — Canadian Dollar',         flag: '🇨🇦' },
  { value: 'CHF', label: 'CHF — Swiss Franc',             flag: '🇨🇭' },
  { value: 'CLP', label: 'CLP — Chilean Peso',            flag: '🇨🇱' },
  { value: 'CNY', label: 'CNY — Chinese Yuan',            flag: '🇨🇳' },
  { value: 'COP', label: 'COP — Colombian Peso',          flag: '🇨🇴' },
  { value: 'CRC', label: 'CRC — Costa Rican Colón',       flag: '🇨🇷' },
  { value: 'CVE', label: 'CVE — Cape Verdean Escudo',     flag: '🇨🇻' },
  { value: 'CZK', label: 'CZK — Czech Koruna',            flag: '🇨🇿' },
  { value: 'DKK', label: 'DKK — Danish Krone',            flag: '🇩🇰' },
  { value: 'DOP', label: 'DOP — Dominican Peso',          flag: '🇩🇴' },
  { value: 'EGP', label: 'EGP — Egyptian Pound',          flag: '🇪🇬' },
  { value: 'EUR', label: 'EUR — Euro',                    flag: '🇪🇺' },
  { value: 'GBP', label: 'GBP — British Pound',           flag: '🇬🇧' },
  { value: 'GEL', label: 'GEL — Georgian Lari',           flag: '🇬🇪' },
  { value: 'GHS', label: 'GHS — Ghanaian Cedi',           flag: '🇬🇭' },
  { value: 'GMD', label: 'GMD — Gambian Dalasi',          flag: '🇬🇲' },
  { value: 'GNF', label: 'GNF — Guinean Franc',           flag: '🇬🇳' },
  { value: 'GTQ', label: 'GTQ — Guatemalan Quetzal',      flag: '🇬🇹' },
  { value: 'HKD', label: 'HKD — Hong Kong Dollar',        flag: '🇭🇰' },
  { value: 'HNL', label: 'HNL — Honduran Lempira',        flag: '🇭🇳' },
  { value: 'HUF', label: 'HUF — Hungarian Forint',        flag: '🇭🇺' },
  { value: 'IDR', label: 'IDR — Indonesian Rupiah',       flag: '🇮🇩' },
  { value: 'ILS', label: 'ILS — Israeli Shekel',          flag: '🇮🇱' },
  { value: 'INR', label: 'INR — Indian Rupee',            flag: '🇮🇳' },
  { value: 'ISK', label: 'ISK — Icelandic Króna',         flag: '🇮🇸' },
  { value: 'JPY', label: 'JPY — Japanese Yen',            flag: '🇯🇵' },
  { value: 'KES', label: 'KES — Kenyan Shilling',         flag: '🇰🇪' },
  { value: 'KGS', label: 'KGS — Kyrgystani Som',          flag: '🇰🇬' },
  { value: 'KHR', label: 'KHR — Cambodian Riel',          flag: '🇰🇭' },
  { value: 'KRW', label: 'KRW — South Korean Won',        flag: '🇰🇷' },
  { value: 'KWD', label: 'KWD — Kuwaiti Dinar',           flag: '🇰🇼' },
  { value: 'LAK', label: 'LAK — Laotian Kip',             flag: '🇱🇦' },
  { value: 'LKR', label: 'LKR — Sri Lankan Rupee',        flag: '🇱🇰' },
  { value: 'MAD', label: 'MAD — Moroccan Dirham',         flag: '🇲🇦' },
  { value: 'MNT', label: 'MNT — Mongolian Tögrög',        flag: '🇲🇳' },
  { value: 'MOP', label: 'MOP — Macanese Pataca',         flag: '🇲🇴' },
  { value: 'MUR', label: 'MUR — Mauritian Rupee',         flag: '🇲🇺' },
  { value: 'MXN', label: 'MXN — Mexican Peso',            flag: '🇲🇽' },
  { value: 'MYR', label: 'MYR — Malaysian Ringgit',       flag: '🇲🇾' },
  { value: 'NAD', label: 'NAD — Namibian Dollar',         flag: '🇳🇦' },
  { value: 'NGN', label: 'NGN — Nigerian Naira',          flag: '🇳🇬' },
  { value: 'NIO', label: 'NIO — Nicaraguan Córdoba',      flag: '🇳🇮' },
  { value: 'NOK', label: 'NOK — Norwegian Krone',         flag: '🇳🇴' },
  { value: 'NPR', label: 'NPR — Nepalese Rupee',          flag: '🇳🇵' },
  { value: 'NZD', label: 'NZD — New Zealand Dollar',      flag: '🇳🇿' },
  { value: 'OMR', label: 'OMR — Omani Rial',              flag: '🇴🇲' },
  { value: 'PEN', label: 'PEN — Peruvian Sol',            flag: '🇵🇪' },
  { value: 'PHP', label: 'PHP — Philippine Peso',         flag: '🇵🇭' },
  { value: 'PKR', label: 'PKR — Pakistani Rupee',         flag: '🇵🇰' },
  { value: 'PLN', label: 'PLN — Polish Złoty',            flag: '🇵🇱' },
  { value: 'PYG', label: 'PYG — Paraguayan Guaraní',      flag: '🇵🇾' },
  { value: 'QAR', label: 'QAR — Qatari Riyal',            flag: '🇶🇦' },
  { value: 'RON', label: 'RON — Romanian Leu',            flag: '🇷🇴' },
  { value: 'RSD', label: 'RSD — Serbian Dinar',           flag: '🇷🇸' },
  { value: 'RWF', label: 'RWF — Rwandan Franc',           flag: '🇷🇼' },
  { value: 'SAR', label: 'SAR — Saudi Riyal',             flag: '🇸🇦' },
  { value: 'SCR', label: 'SCR — Seychellois Rupee',       flag: '🇸🇨' },
  { value: 'SEK', label: 'SEK — Swedish Krona',           flag: '🇸🇪' },
  { value: 'SGD', label: 'SGD — Singapore Dollar',        flag: '🇸🇬' },
  { value: 'SRD', label: 'SRD — Surinamese Dollar',       flag: '🇸🇷' },
  { value: 'THB', label: 'THB — Thai Baht',               flag: '🇹🇭' },
  { value: 'TND', label: 'TND — Tunisian Dinar',          flag: '🇹🇳' },
  { value: 'TRY', label: 'TRY — Turkish Lira',            flag: '🇹🇷' },
  { value: 'TZS', label: 'TZS — Tanzanian Shilling',      flag: '🇹🇿' },
  { value: 'UAH', label: 'UAH — Ukrainian Hryvnia',       flag: '🇺🇦' },
  { value: 'UGX', label: 'UGX — Ugandan Shilling',        flag: '🇺🇬' },
  { value: 'USD', label: 'USD — US Dollar',               flag: '🇺🇸' },
  { value: 'UYU', label: 'UYU — Uruguayan Peso',          flag: '🇺🇾' },
  { value: 'VND', label: 'VND — Vietnamese Dong',         flag: '🇻🇳' },
  { value: 'ZAR', label: 'ZAR — South African Rand',      flag: '🇿🇦' },
]

function floorTwo(n: number): string {
  return (Math.floor(n * 100) / 100).toFixed(2)
}

interface AmountStepProps {
  initialState: Partial<OrderState>
  walletAddress: string
  walletNetwork: string
  walletChainId: number | undefined
  onNext: (data: Partial<OrderState>) => void
  onSessionExpired: () => void
}

export function AmountStep({ initialState, walletAddress, walletNetwork, walletChainId, onNext, onSessionExpired }: AmountStepProps) {
  const [amountStr, setAmountStr] = useState(
    initialState.amount != null ? String(initialState.amount) : '',
  )
  const [currency, setCurrency] = useState(initialState.currency ?? 'EUR')
  const [quote, setQuote] = useState<QuoteResponse | null>(
    initialState.quote ?? null,
  )
  const [email, setEmail] = useState(initialState.userEmail ?? '')
  const [emailError, setEmailError] = useState<string | null>(null)

  // Source token (USDC or EURC) — determined by the connected network.
  // Defaults to the saved value or 'usdc'. Auto-resets to 'usdc' if the
  // network changes to one that only supports USDC.
  const [sourceToken, setSourceToken] = useState<'usdc' | 'eurc'>(
    (initialState.sourceToken as 'usdc' | 'eurc') ?? 'usdc',
  )

  // Keep sourceToken valid when walletNetwork changes
  useEffect(() => {
    const supported = NETWORK_TO_SOURCE_TOKENS[walletNetwork] ?? ['usdc']
    if (!supported.includes(sourceToken)) {
      setSourceToken('usdc')
    }
  }, [walletNetwork, sourceToken])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [amountError, setAmountError] = useState<string | null>(null)

  // Amount limits — fetched from API, fallback to safe defaults while loading
  const [minAmount, setMinAmount] = useState<number>(1)
  const [maxAmount, setMaxAmount] = useState<number>(1_000_000)
  const [limitsLoaded, setLimitsLoaded] = useState(false)

  // Transfer status lookup
  const [lookupId, setLookupId] = useState('')
  const [lookupResult, setLookupResult] = useState<TransferRecord | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch amount limits once on mount
  useEffect(() => {
    getAmountLimits()
      .then((limits) => {
        if (typeof limits.min_amount === 'number' && isFinite(limits.min_amount)) {
          setMinAmount(limits.min_amount)
        }
        if (typeof limits.max_amount === 'number' && isFinite(limits.max_amount)) {
          setMaxAmount(limits.max_amount)
        }
        setLimitsLoaded(true)
      })
      .catch(() => {
        // Non-fatal — keep permissive defaults; server will reject out-of-range amounts
        setLimitsLoaded(true)
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

  async function handleLookup() {
    const id = lookupId.trim()
    if (!id) return
    setLookupLoading(true)
    setLookupResult(null)
    setLookupError(null)
    try {
      const result = await getTransferStatus(id)
      setLookupResult(result)
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 404) {
        setLookupError('Transfer not found. Please check your Transfer ID and try again.')
      } else {
        setLookupError(e.message || 'Failed to look up transfer status.')
      }
    } finally {
      setLookupLoading(false)
    }
  }

  function validateAmount(): boolean {
    const usd = parseFloat(amountStr)
    if (!amountStr || isNaN(usd)) {
      setAmountError('Enter a valid amount')
      return false
    }
    if (usd < minAmount) {
      setAmountError(`Minimum amount is $${minAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      return false
    }
    if (usd > maxAmount) {
      setAmountError(`Maximum amount is $${maxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      return false
    }
    if (!/^\d+(\.\d{0,2})?$/.test(amountStr)) {
      setAmountError('Max 2 decimal places')
      return false
    }
    setAmountError(null)
    return true
  }

  function validateEmail(): boolean {
    const trimmed = email.trim()
    if (!trimmed) {
      setEmailError('Email is required')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  async function handleContinue() {
    if (!validateAmount()) return
    if (!validateEmail()) return
    if (!quote) return

    setLoading(true)
    try {
      const captchaToken = await executeCaptcha('offramp_continue')
      await verifyCaptchaToken(captchaToken)
    } catch (err) {
      setError((err as Error).message || 'Security check failed. Please try again.')
      setLoading(false)
      return
    }
    setLoading(false)

    const usd = parseFloat(amountStr)
    onNext({
      amount: usd,
      currency,
      quoteId: quote.quoteId,
      quote,
      sourceToken,
      // Only set sourceNetwork from wallet if connected; otherwise leave undefined
      // so the API can assign a deposit address on any supported network
      ...(walletNetwork ? { sourceNetwork: walletNetwork } : {}),
      userEmail: email.trim(),
      ...(walletAddress ? { walletAddress, connectedChainId: walletChainId } : {}),
    })
  }

  const usd = parseFloat(amountStr)
  const serviceFee = quote?.serviceFee ?? 0
  const serviceFeePercent = quote?.serviceFeePercent ?? 0
  const canContinue = !loading && !error && quote !== null && !amountError

  const transferFeeUsd = quote?.quote.transferFee ?? null
  const estimatedDelivery = quote?.quote.estimatedDelivery ?? null

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
          min={String(minAmount)}
          max={String(maxAmount)}
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
        <CurrencySelect
          label="Recipient Currency"
          value={currency}
          onChange={setCurrency}
          options={CURRENCIES}
          required
        />
      </div>
      {limitsLoaded && (
        <p className="text-xs text-gray-400">
          Minimum ${minAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Maximum ${maxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per transfer
        </p>
      )}

      {/* Wallet — optional. Soft nudge when not connected; confirmation when connected. */}
      {!walletAddress ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">Optional:</span> Connect your wallet to send crypto directly. Without a wallet, you&apos;ll receive a deposit address in the next step.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5">
          <svg className="h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-xs text-green-700">
            Wallet connected — you&apos;ll send {sourceToken.toUpperCase()} directly from your wallet in the next step.
          </p>
        </div>
      )}

      {/* Source token selector — only shown when the connected network supports EURC */}
      {walletAddress && walletNetwork && (NETWORK_TO_SOURCE_TOKENS[walletNetwork] ?? ['usdc']).length > 1 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-gray-500">Source token</p>
          <div className="flex gap-2">
            {(NETWORK_TO_SOURCE_TOKENS[walletNetwork] ?? ['usdc']).map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => setSourceToken(token)}
                className={[
                  'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500',
                  sourceToken === token
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                ].join(' ')}
                aria-pressed={sourceToken === token}
              >
                <span className="text-base">{token === 'usdc' ? '🔵' : '⭐'}</span>
                {token.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Email */}
      <Input
        label="Your Email"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setEmailError(null)
        }}
        error={emailError ?? undefined}
        required
      />

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
            <span className="text-gray-500">You send</span>
            <span className="font-semibold text-gray-900">
              ${floorTwo(usd)} {sourceToken.toUpperCase()}
            </span>
          </div>

          {serviceFee > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-500">Service fee ({floorTwo(serviceFeePercent)}%)</span>
              <span className="font-medium text-gray-900">−${floorTwo(serviceFee)}</span>
            </div>
          )}

          {transferFeeUsd != null && (
            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-500">Transfer fee</span>
              <span className="font-medium text-gray-900">
                −${floorTwo(transferFeeUsd)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-gray-500">Exchange rate</span>
            <span className="font-medium text-gray-900">
              1 USD ≈ {floorTwo(quote.usdToTargetRate)} {quote.targetCurrency}
            </span>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="font-medium text-gray-700">Recipient gets</span>
            <span className="font-semibold text-orange-600">
              {quote.quote.targetAmount != null ? floorTwo(quote.quote.targetAmount) : '—'} {quote.targetCurrency}
            </span>
          </div>

          {estimatedDelivery && (
            <div className="px-4 py-2.5">
              <p className="text-xs text-gray-400">
                Estimated delivery:{' '}
                {new Date(estimatedDelivery).toLocaleDateString(undefined, {
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
        onClick={() => { void handleContinue() }}
        disabled={!canContinue}
        loading={loading}
      >
        Continue
      </Button>


      {/* Transfer status lookup */}
      <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Check a previous transfer</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Transfer ID"
            value={lookupId}
            onChange={(e) => {
              setLookupId(e.target.value)
              setLookupResult(null)
              setLookupError(null)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleLookup() }}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            type="button"
            onClick={() => void handleLookup()}
            disabled={!lookupId.trim() || lookupLoading}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {lookupLoading ? '…' : 'Check'}
          </button>
        </div>

        {lookupError && (
          <p className="mt-2 text-xs text-red-600">{lookupError}</p>
        )}

        {lookupResult && (
          <TransferStatusCard transfer={lookupResult} />
        )}
      </div>
    </div>
  )
}
