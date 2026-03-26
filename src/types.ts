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
  sourceToken?: string   // e.g. "usdc", "usdt", "eth"
  sourceNetwork?: string // e.g. "base", "ethereum", "polygon"
  userEmail?: string

  // Set by RecipientStep
  recipientId?: number
  recipientName?: string
  recipientType?: string
  recipientDetails?: Record<string, unknown>

  // Set by ConfirmStep/SendStep
  customerId?: string
  transferId?: string
  depositAddress?: string
  depositAmount?: string
  depositCurrency?: string
}

// ─── API response types ───────────────────────────────────────────────────────

export interface WisePaymentOption {
  payIn: string
  fee: { transfer: number | null }
  estimatedDelivery: string | null
}

export interface QuoteResponse {
  quoteId: string
  sourceAmount: number
  developerFee: number
  developerFeePercent: number
  netUsdAmount: number
  targetCurrency: string
  usdToTargetRate: number
  quote: {
    targetAmount: number | null
    paymentOptions?: WisePaymentOption[]
  }
}

export interface FeeResponse {
  mwFee: number
  mwFeePercentage: number
  isDiscounted: boolean
  capApplied: boolean
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
  source_token?: string
  source_network?: string
}

export interface TransferResponse {
  transfer_id: string
  deposit_address: string
  amount: string
  currency: string
}

// ─── Transfer status ───────────────────────────────────────────────────────────

export interface TransferStatusResponse {
  transfer_id: string
  status: string
  status_label: string
  amount: number
  currency: string | null
  created_at: string
  updated_at: string
  terminal: boolean
}
