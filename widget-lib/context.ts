/**
 * ApiClientContext
 *
 * Provides the API client functions to all widget components so the lib build
 * can inject its own client (plain JSON, no JWE) without modifying any of the
 * existing step components.
 */
import { createContext, useContext } from 'react'
import type {
  QuoteResponse,
  RequirementsResponse,
  RecipientResponse,
  CreateRecipientPayload,
  CreateTransferPayload,
  TransferResponse,
  TransferRecord,
  DepositOption,
} from './types'

export interface ApiClient {
  getQuote: (currency: string, amount: number) => Promise<QuoteResponse>
  getDepositOptions: () => Promise<DepositOption[]>
  getAccountRequirements: (currency: string) => Promise<RequirementsResponse>
  refreshAccountRequirements: (currency: string, type: string, details: Record<string, string>) => Promise<RequirementsResponse>
  createRecipient: (payload: CreateRecipientPayload) => Promise<RecipientResponse>
  deleteRecipient: (recipientId: number) => Promise<void>
  createTransfer: (payload: CreateTransferPayload) => Promise<TransferResponse>
  cancelTransfer: (transferId?: string) => Promise<void>
  getTransferStatus: (transferId: string) => Promise<TransferRecord>
  executeCaptcha: (action: string) => Promise<string | null>
  verifyCaptchaToken: (token: string | null) => Promise<void>
}

export const ApiClientContext = createContext<ApiClient | null>(null)

export function useApiClient(): ApiClient {
  const ctx = useContext(ApiClientContext)
  if (!ctx) throw new Error('[mw-offramp] ApiClientContext not provided')
  return ctx
}
