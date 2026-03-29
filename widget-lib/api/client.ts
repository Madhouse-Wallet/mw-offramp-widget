/**
 * lib/api/client.ts
 *
 * API client for the embeddable library build.
 *
 * Unlike the Next.js app's client.ts (which calls /api/auth/widget-token,
 * /api/auth/widget-key, and encrypts payloads), this version calls the
 * consumer's proxy directly using plain JSON.
 *
 * The consumer is responsible for:
 *   - Hosting a backend proxy that holds WIDGET_API_KEY and WIDGET_USER_ID
 *   - Any auth headers their proxy requires (pass via `getHeaders`)
 *   - reCAPTCHA, WhatsApp support, etc.
 *
 * Config is injected once via `configureClient()` before the widget mounts.
 */

import type {
  QuoteResponse,
  FeeResponse,
  AmountLimitsResponse,
  RequirementsResponse,
  RecipientResponse,
  CreateRecipientPayload,
  CreateTransferPayload,
  TransferResponse,
  TransferStatusResponse,
  TransferRecord,
  DepositOptionsResponse,
  DepositOption,
} from '../types'

// ─── Client config ────────────────────────────────────────────────────────────

export interface ClientConfig {
  /**
   * Base URL of the consumer's proxy, e.g. "https://yourapp.com/api/proxy"
   * Must NOT have a trailing slash.
   * The client appends paths like "/payouts/quote", "/payouts/recipients", etc.
   */
  proxyUrl: string

  /**
   * Optional function that returns additional headers to include on every
   * request (e.g. an Authorization header for the consumer's own auth).
   * May be async.
   */
  getHeaders?: () => HeadersInit | Promise<HeadersInit>
}

let _config: ClientConfig | null = null

export function configureClient(config: ClientConfig): void {
  _config = { ...config, proxyUrl: config.proxyUrl.replace(/\/$/, '') }
}

function getConfig(): ClientConfig {
  if (!_config) throw new Error('[mw-offramp] Call configureClient() before mounting the widget.')
  return _config
}

// ─── Allowed currencies ───────────────────────────────────────────────────────

const ALLOWED_CURRENCIES = new Set([
  'AED','ARS','ALL','AUD','BAM','BDT','BGN','BHD','BMD','BOB',
  'BRL','BWP','CAD','CHF','CLP','CNY','COP','CRC','CVE','CZK',
  'DKK','DOP','EGP','EUR','GBP','GEL','GHS','GMD','GNF','GTQ',
  'HKD','HNL','HUF','IDR','ILS','INR','ISK','JPY','KES','KGS',
  'KHR','KRW','KWD','LAK','LKR','MAD','MNT','MOP','MUR','MXN',
  'MYR','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PEN','PHP',
  'PKR','PLN','PYG','QAR','RON','RSD','RWF','SAR','SCR','SEK',
  'SGD','SRD','THB','TND','TRY','TZS','UAH','UGX','USD','UYU',
  'VND','ZAR',
])

// ─── Sanitization helpers ─────────────────────────────────────────────────────

function sanitizeString(value: string, maxLen = 500): string {
  return value.replace(/\x00/g, '').slice(0, maxLen)
}

function sanitizeDetails(details: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(details)) {
    const safeKey = sanitizeString(k, 100)
    const safeVal = sanitizeString(v, 500)
    if (safeKey) out[safeKey] = safeVal
  }
  return out
}

function validateRecipientId(id: number): void {
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new Error('Invalid recipient ID')
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cfg = getConfig()
  const extraHeaders = cfg.getHeaders ? await cfg.getHeaders() : {}

  const res = await fetch(`${cfg.proxyUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
      ...(options.headers ?? {}),
    },
  })

  const responseText = await res.text()
  let parsed: unknown
  try { parsed = JSON.parse(responseText) } catch { parsed = responseText }

  if (!res.ok) {
    const errBody = parsed as Record<string, unknown>
    const message =
      typeof errBody?.error === 'string'
        ? sanitizeString(errBody.error, 300)
        : typeof parsed === 'string'
          ? sanitizeString(parsed, 300)
          : `Request failed with status ${res.status}`
    const err = new Error(message)
    ;(err as Error & { status: number }).status = res.status
    if (typeof errBody?.transfer_id === 'string') {
      ;(err as Error & { transfer_id: string }).transfer_id = errBody.transfer_id
    }
    throw err
  }

  return parsed as T
}

// ─── Public API functions ─────────────────────────────────────────────────────

export async function getTransferStatus(transferId: string): Promise<TransferRecord> {
  if (!/^[0-9a-f]{24}$/i.test(transferId)) throw new Error('Invalid transfer ID format')
  const res = await apiFetch<TransferStatusResponse>(
    `/payouts/transfer/${encodeURIComponent(transferId)}`,
  )
  return res.transfer
}

export async function getDepositOptions(): Promise<DepositOption[]> {
  const resp = await apiFetch<DepositOptionsResponse>('/payouts/deposit-options')
  return resp.options ?? []
}

export async function getFee(): Promise<FeeResponse> {
  return apiFetch<FeeResponse>('/payouts/fee')
}

export async function getAmountLimits(): Promise<AmountLimitsResponse> {
  return apiFetch<AmountLimitsResponse>('/payouts/amount-limits')
}

export async function getQuote(currency: string, amount: number): Promise<QuoteResponse> {
  if (!ALLOWED_CURRENCIES.has(currency)) throw new Error(`Unsupported currency: ${currency}`)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount')
  const rounded = Math.round(amount * 100) / 100
  return apiFetch<QuoteResponse>(
    `/payouts/quote?targetCurrency=${encodeURIComponent(currency)}&sourceAmount=${encodeURIComponent(String(rounded))}`,
  )
}

export async function getAccountRequirements(currency: string): Promise<RequirementsResponse> {
  if (!ALLOWED_CURRENCIES.has(currency)) throw new Error(`Unsupported currency: ${currency}`)
  return apiFetch<RequirementsResponse>(
    `/payouts/account-requirements?currency=${encodeURIComponent(currency)}`,
  )
}

export async function refreshAccountRequirements(
  currency: string,
  type: string,
  details: Record<string, string>,
): Promise<RequirementsResponse> {
  if (!ALLOWED_CURRENCIES.has(currency)) throw new Error(`Unsupported currency: ${currency}`)
  return apiFetch<RequirementsResponse>(
    `/payouts/account-requirements?currency=${encodeURIComponent(currency)}`,
    {
      method: 'POST',
      body: JSON.stringify({ type: sanitizeString(type, 50), details: sanitizeDetails(details) }),
    },
  )
}

export async function createRecipient(payload: CreateRecipientPayload): Promise<RecipientResponse> {
  if (!ALLOWED_CURRENCIES.has(payload.currency)) throw new Error(`Unsupported currency: ${payload.currency}`)
  const sanitized: CreateRecipientPayload = {
    currency: payload.currency,
    type: sanitizeString(payload.type, 50),
    accountHolderName: sanitizeString(payload.accountHolderName, 200),
    details: sanitizeDetails(payload.details),
  }
  return apiFetch<RecipientResponse>('/payouts/recipients', {
    method: 'POST',
    body: JSON.stringify(sanitized),
  })
}

export async function deleteRecipient(recipientId: number): Promise<void> {
  validateRecipientId(recipientId)
  await apiFetch<void>(`/payouts/recipients/${recipientId}`, { method: 'DELETE' })
}

export async function cancelTransfer(transferId?: string): Promise<void> {
  await apiFetch<{ ok: boolean }>('/payouts/transfer/cancel', {
    method: 'POST',
    body: JSON.stringify(transferId ? { transfer_id: transferId } : {}),
  }).catch(() => {/* best-effort */})
}

// ─── reCAPTCHA stubs ─────────────────────────────────────────────────────────
// The lib consumer handles their own captcha. These are no-ops so AmountStep
// compiles without modification.

export async function executeCaptcha(_action: string): Promise<string | null> {
  return null
}

export async function verifyCaptchaToken(_token: string | null): Promise<void> {
  // no-op
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export async function createTransfer(payload: CreateTransferPayload): Promise<TransferResponse> {
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new Error('Invalid transfer amount')
  }
  validateRecipientId(payload.recipientId)
  const uuidRe = /^[0-9a-f-]{32,36}$/i
  if (!uuidRe.test(payload.quote_id)) throw new Error('Invalid quote ID')
  if (!uuidRe.test(payload.customer_uuid)) throw new Error('Invalid customer UUID')
  return apiFetch<TransferResponse>('/payouts/transfer', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
