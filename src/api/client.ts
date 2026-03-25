import type {
  QuoteResponse,
  RequirementsResponse,
  RecipientResponse,
  CreateRecipientPayload,
  CreateTransferPayload,
  TransferResponse,
  TransferStatusResponse,
  DepositOptionsResponse,
  DepositOption,
} from '../types'
import { encryptPayload, decryptPayload } from '../lib/payload-crypto'

// Allowed currencies — must match server-side ALLOWED_CURRENCIES
const ALLOWED_CURRENCIES = new Set([
  'AED','AUD','BDT','BGN','BRL','CAD','CHF','CZK','DKK','EGP',
  'EUR','GBP','GHS','HKD','HRK','HUF','IDR','ILS','INR','JPY',
  'KES','LKR','MAD','MXN','MYR','NGN','NOK','NPR','NZD','PHP',
  'PKR','PLN','RON','RWF','SAR','SEK','SGD','THB','TRY','TZS',
  'UGX','USD','VND','XOF','ZAR',
])

// ─── Widget JWT token cache ───────────────────────────────────────────────────

interface TokenCache {
  token: string
  expiresAt: number // Unix ms
}

let _tokenCache: TokenCache | null = null

async function getWidgetToken(): Promise<string> {
  const now = Date.now()
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

// ─── Encryption key cache ─────────────────────────────────────────────────────
// The AES-256-GCM key is fetched once from /api/auth/widget-key and cached for
// the session. The server vends it as base64url; we decode to Uint8Array here.

let _encryptKey: Uint8Array | null = null

async function getEncryptKey(): Promise<Uint8Array> {
  if (_encryptKey) return _encryptKey
  const res = await fetch('/api/auth/widget-key')
  if (!res.ok) {
    throw Object.assign(new Error('Failed to obtain encryption key'), { status: res.status })
  }
  const { key } = (await res.json()) as { key: string }
  // Decode base64url → Uint8Array
  const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  _encryptKey = bytes
  return _encryptKey
}

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

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const [token, encryptKey] = await Promise.all([getWidgetToken(), getEncryptKey()])

  // Encrypt request body if present
  let body: string | undefined
  if (options.body != null) {
    const plainData = JSON.parse(options.body as string)
    const jwe = await encryptPayload(plainData, encryptKey)
    body = JSON.stringify({ jwe })
  }

  const res = await fetch(path, {
    ...options,
    body,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })

  const responseText = await res.text()

  // Parse outer envelope
  let envelope: unknown
  try {
    envelope = JSON.parse(responseText)
  } catch {
    envelope = responseText
  }

  if (!res.ok) {
    // Error responses from the proxy are plain JSON (not encrypted)
    const errBody = envelope as Record<string, unknown>
    const message =
      typeof errBody?.error === 'string'
        ? sanitizeString(errBody.error, 300)
        : typeof envelope === 'string'
          ? sanitizeString(envelope, 300)
          : `Request failed with status ${res.status}`
    const err = new Error(message)
    ;(err as Error & { status: number }).status = res.status
    if (typeof errBody?.transfer_id === 'string') {
      ;(err as Error & { transfer_id: string }).transfer_id = errBody.transfer_id
    }
    throw err
  }

  // Decrypt the JWE response envelope
  const jwe = (envelope as Record<string, unknown>)?.jwe
  if (typeof jwe !== 'string') {
    throw new Error('Response is not encrypted')
  }
  return decryptPayload<T>(jwe, encryptKey)
}

// ─── Public API functions ─────────────────────────────────────────────────────

export async function getTransferStatus(transferId: string): Promise<TransferStatusResponse> {
  if (!/^[0-9a-f]{24}$/i.test(transferId)) {
    throw new Error('Invalid transfer ID format')
  }
  return apiFetch<TransferStatusResponse>(
    `/api/proxy/payouts/transfer-status/${encodeURIComponent(transferId)}`,
  )
}

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

export async function cancelTransfer(transferId?: string): Promise<void> {
  await apiFetch<{ ok: boolean }>('/api/proxy/payouts/transfer/cancel', {
    method: 'POST',
    body: JSON.stringify(transferId ? { transfer_id: transferId } : {}),
  }).catch(() => {/* best-effort — never block the UI */})
}

export async function createTransfer(
  payload: CreateTransferPayload,
): Promise<TransferResponse> {
  if (!Number.isFinite(payload.amount) || payload.amount <= 0 || payload.amount > 1_000_000) {
    throw new Error('Invalid transfer amount')
  }
  validateRecipientId(payload.recipientId)
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
