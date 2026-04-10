// ─── Widget config ────────────────────────────────────────────────────────────

export interface WidgetConfig {
  // baseUrl removed — widget always calls /api/proxy/... on same origin
}

export interface WidgetProps {
  onSuccess?: (transferId: string) => void
  onError?: (error: Error) => void
}

// ─── Steps ────────────────────────────────────────────────────────────────────

export type Step = 'amount' | 'recipient' | 'confirm' | 'send'

// ─── Shared order state (grows as steps complete) ─────────────────────────────

// ─── Deposit options ──────────────────────────────────────────────────────────

export interface DepositOption {
  token: string       // e.g. "usdc", "usdt", "eth"
  network: string     // e.g. "base", "ethereum", "polygon"
  label: string       // Human-readable, e.g. "USDC on Base"
  tokenLabel: string  // e.g. "USDC"
  networkLabel: string// e.g. "Base"
}

export interface DepositOptionsResponse {
  options: DepositOption[]
}

// ─── Shared order state (grows as steps complete) ─────────────────────────────

export interface OrderState {
  // Set by AmountStep
  amount?: number
  currency?: string
  quoteId?: string
  quote?: QuoteResponse
  sourceToken?: string   // always "usdc"
  sourceNetwork?: string // e.g. "base", "ethereum", "polygon", "solana"
  userEmail?: string
  walletAddress?: string // populated from connected wallet — read-only to user
  connectedChainId?: number // EVM chain ID (undefined for Solana)

  // Set by RecipientStep
  recipientId?: number
  recipientName?: string
  recipientType?: string
  recipientDetails?: Record<string, unknown>

  // Set by ConfirmStep/SendStep (populated from POST /api/payouts/transfer response)
  customerId?: string
  transferId?: string
  depositAddress?: string
  // From transfer record
  transferStatus?: string
  transferStatusLabel?: string
  transferReference?: string
  transferAmount?: number
  transferCurrency?: string
}

// ─── API response types ───────────────────────────────────────────────────────

export interface QuoteResponse {
  quoteId: string
  sourceAmount: number
  serviceFee: number
  serviceFeePercent: number
  netUsdAmount: number
  targetCurrency: string
  usdToTargetRate: number
  quote: {
    targetAmount: number | null
    transferFee: number | null
    estimatedDelivery: string | null
  }
}

export interface FeeResponse {
  mwFee: number
  mwFeePercentage: number
  isDiscounted: boolean
  capApplied: boolean
}

export interface AmountLimitsResponse {
  min_amount: number
  max_amount: number
}

// Quote snapshot stored on a transfer record
export interface TransferQuoteSnapshot {
  sourceAmount: number
  serviceFee: number
  serviceFeePercent: number
  netUsdAmount: number
  targetCurrency: string
  usdToTargetRate: number
  targetAmount: number | null
  transferFee: number | null
  estimatedDelivery: string | null
}

// ─── Account requirements ─────────────────────────────────────────────────────

export interface RequirementsField {
  key: string
  name: string
  type: 'text' | 'select' | 'radio'
  required: boolean
  refreshRequirementsOnChange: boolean
  minLength?: number
  maxLength?: number
  validationRegexp?: string
  example?: string
  valuesAllowed?: Array<{ key: string; name: string }>
}

export interface RequirementsGroup {
  name: string
  group: RequirementsField[]
}

export interface AccountType {
  type: string
  title: string
  fields: RequirementsGroup[]
}

export interface RequirementsResponse {
  data: AccountType[]
}

// ─── Recipient ─────────────────────────────────────────────────────────────────

export interface RecipientResponse {
  id: number
  accountHolderName: string
  currency: string
  type: string
  active: boolean
  details: Record<string, unknown>
}

export interface CreateRecipientPayload {
  currency: string
  type: string
  accountHolderName: string
  details: Record<string, string>
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

export interface CreateTransferPayload {
  quote_id: string
  amount: number
  recipientId: number
  customer_uuid: string
  customer_email: string
  source_token: string
  source_network: string
  wallet_address?: string
}

// POST /api/payouts/transfer returns the same TransferResponse wrapper as GET
export type TransferResponse = TransferStatusResponse

// ─── Transfer status ───────────────────────────────────────────────────────────

export interface RecipientSnapshot {
  id: number
  accountHolderName: string
  currency: string
  type: string
  country: string | null
  details: Record<string, unknown>
}

export interface TransferRecord {
  id: string
  user_id?: string
  type: string
  amount: number
  currency: string | null
  status: string
  status_label: string
  recipientId: number
  recipient: RecipientSnapshot | null
  customerUuid: string | null
  customerEmail: string | null
  sourceToken: string | null
  sourceNetwork: string | null
  quote: TransferQuoteSnapshot | null
  wallet_address: string | null
  deposit_address: string | null
  error: string | null
  reference: string
  timestamp: string
  updated_at: string | null
}

export interface TransferStatusResponse {
  transfer: TransferRecord
}
