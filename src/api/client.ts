import type {
  QuoteResponse,
  RequirementsResponse,
  RecipientResponse,
  CreateRecipientPayload,
  CreateTransferPayload,
  TransferResponse,
  DepositOptionsResponse,
  DepositOption,
} from '../types'

// Allowed currencies — must match server-side ALLOWED_CURRENCIES
const ALLOWED_CURRENCIES = new Set([
  'AED','AUD','BDT','BGN','BRL','CAD','CHF','CZK','DKK','EGP',
  'EUR','GBP','GHS','HKD','HRK','HUF','IDR','ILS','INR','JPY',
  'KES','LKR','MAD','MXN','MYR','NGN','NOK','NPR','NZD','PHP',
  'PKR','PLN','RON','RWF','SAR','SEK','SGD','THB','TRY','TZS',
  'UGX','USD','VND','XOF','ZAR',
])

// ─── Widget JWT token cache ───────────────────────────────────────────────────
// A short-lived JWT is provisioned from /api/auth/widget-token and attached to
// every proxy request. This ensures only the legitimate widget frontend (served
// from the same Next.js origin) can reach the proxy — external callers cannot
// obtain a valid token. The token is cached in memory for its lifetime.

interface TokenCache {
  token: string
  expiresAt: number // Unix ms
}

let _tokenCache: TokenCache | null = null

async function getWidgetToken(): Promise<string> {
  const now = Date.now()
  // Refresh 60 seconds before expiry to avoid edge-case races
  if (_tokenCache && _tokenCache.expiresAt - 60_000 > now) {
    return _tokenCache.token
  }

  const res = await fetch('/api/auth/widget-token', { method: 'POST' })
  if (!res.ok) {
    throw Object.assign(new Error('Failed to obtain widget token'), { status: res.status })
  }
  const data = (await res.json()) as { token: string; expiresIn: number }
  _tokenCache = {
    token: data.token,
    expiresAt: now + data.expiresIn * 1000,
  }
  return data.token
}

// ─── Sanitization helpers ─────────────────────────────────────────────────────

// Sanitize a plain string value: strip null bytes and limit length
function sanitizeString(value: string, maxLen = 500): string {
  return value.replace(/\x00/g, '').slice(0, maxLen)
}

// Sanitize all string values in a details object
function sanitizeDetails(details: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(details)) {
    const safeKey = sanitizeString(k, 100)
    const safeVal = sanitizeString(v, 500)
    if (safeKey) out[safeKey] = safeVal
  }
  return out
}

// Validate that a recipient ID is a safe positive integer before interpolating into a URL path
function validateRecipientId(id: number): void {
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new Error('Invalid recipient ID')
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getWidgetToken()

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })

  const responseText = await res.text()

  let body: unknown
  try {
    body = JSON.parse(responseText)
  } catch {
    body = responseText
  }

  if (!res.ok) {
    const errBody = body as Record<string, unknown>
    const message =
      typeof errBody?.error === 'string'
        ? sanitizeString(errBody.error, 300)
        : typeof body === 'string'
          ? sanitizeString(body, 300)
          : `Request failed with status ${res.status}`
    const err = new Error(message)
    ;(err as Error & { status: number }).status = res.status
    if (typeof errBody?.transfer_id === 'string') {
      ;(err as Error & { transfer_id: string }).transfer_id = errBody.transfer_id
    }
    throw err
  }

  return body as T
}

// ─── Public API functions ─────────────────────────────────────────────────────

export async function getDepositOptions(): Promise<DepositOption[]> {
  const resp = await apiFetch<DepositOptionsResponse>('/api/proxy/payouts/deposit-options')
  return resp.options ?? []
}

export async function getQuote(
  currency: string,
  amount: number,
): Promise<QuoteResponse> {
  if (!ALLOWED_CURRENCIES.has(currency)) {
    throw new Error(`Unsupported currency: ${currency}`)
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new Error('Invalid amount')
  }
  const rounded = Math.round(amount * 100) / 100
  return apiFetch<QuoteResponse>(
    `/api/proxy/payouts/quote?targetCurrency=${encodeURIComponent(currency)}&sourceAmount=${encodeURIComponent(String(rounded))}`,
  )
}

export async function getAccountRequirements(
  currency: string,
): Promise<RequirementsResponse> {
  if (!ALLOWED_CURRENCIES.has(currency)) {
    throw new Error(`Unsupported currency: ${currency}`)
  }
  return apiFetch<RequirementsResponse>(
    `/api/proxy/payouts/account-requirements?currency=${encodeURIComponent(currency)}`,
  )
}

export async function refreshAccountRequirements(
  currency: string,
  type: string,
  details: Record<string, string>,
): Promise<RequirementsResponse> {
  if (!ALLOWED_CURRENCIES.has(currency)) {
    throw new Error(`Unsupported currency: ${currency}`)
  }
  return apiFetch<RequirementsResponse>(
    `/api/proxy/payouts/account-requirements?currency=${encodeURIComponent(currency)}`,
    {
      method: 'POST',
      body: JSON.stringify({ type: sanitizeString(type, 50), details: sanitizeDetails(details) }),
    },
  )
}

export async function createRecipient(
  payload: CreateRecipientPayload,
): Promise<RecipientResponse> {
  if (!ALLOWED_CURRENCIES.has(payload.currency)) {
    throw new Error(`Unsupported currency: ${payload.currency}`)
  }
  const sanitized: CreateRecipientPayload = {
    currency: payload.currency,
    type: sanitizeString(payload.type, 50),
    accountHolderName: sanitizeString(payload.accountHolderName, 200),
    details: sanitizeDetails(payload.details),
  }
  return apiFetch<RecipientResponse>('/api/proxy/payouts/recipients', {
    method: 'POST',
    body: JSON.stringify(sanitized),
  })
}

export async function deleteRecipient(
  recipientId: number,
): Promise<void> {
  validateRecipientId(recipientId)
  await apiFetch<void>(`/api/proxy/payouts/recipients/${recipientId}`, {
    method: 'DELETE',
  })
}

export async function createTransfer(
  payload: CreateTransferPayload,
): Promise<TransferResponse> {
  if (!Number.isFinite(payload.amount) || payload.amount <= 0 || payload.amount > 1_000_000) {
    throw new Error('Invalid transfer amount')
  }
  validateRecipientId(payload.recipientId)
  // quote_id and customer_uuid are server-generated UUIDs; validate they look like UUIDs
  const uuidRe = /^[0-9a-f-]{32,36}$/i
  if (!uuidRe.test(payload.quote_id)) {
    throw new Error('Invalid quote ID')
  }
  if (!uuidRe.test(payload.customer_uuid)) {
    throw new Error('Invalid customer UUID')
  }
  return apiFetch<TransferResponse>('/api/proxy/payouts/transfer', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
