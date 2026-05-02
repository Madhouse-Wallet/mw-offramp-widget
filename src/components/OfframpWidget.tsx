import React, { useState, useCallback, useEffect } from 'react'
import { StepIndicator } from './ui/StepIndicator'
import { AmountStep } from './steps/AmountStep'
import { RecipientStep } from './steps/RecipientStep'
import { ConfirmStep } from './steps/ConfirmStep'
import { SendStep } from './steps/SendStep'
import { EmailVerifyScreen } from './steps/EmailVerifyScreen'
import { deleteRecipient, cancelTransfer, setSessionToken } from '../api/client'
import type { Step, OrderState, WidgetProps, EthProvider } from '../types'

const SESSION_KEY = 'mw_widget_state'
const TRANSFER_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function saveSession(step: Step, orderState: Partial<OrderState>, transferCreatedAt?: number) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ step, orderState, transferCreatedAt }))
  } catch {
    // sessionStorage unavailable (e.g. private browsing restrictions) — silently ignore
  }
}

function loadSession(): { step: Step; orderState: Partial<OrderState>; transferCreatedAt?: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { step: Step; orderState: Partial<OrderState>; transferCreatedAt?: number }
    // verify-email is never persisted — always restart from email gate
    const validSteps: Step[] = ['amount', 'recipient', 'confirm', 'send']
    if (!validSteps.includes(parsed.step)) return null
    return parsed
  } catch {
    return null
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

export function OfframpWidget({ onSuccess, onError, connectedEvmAddress, connectedSolanaAddress, evmProvider }: WidgetProps) {
  const saved = loadSession()

  // If the session was saved mid-send (transferId exists), determine whether the
  // transfer has expired (> 5 min old) or is still fresh enough to recover.
  const savedTransferId =
    saved?.step === 'send' && saved?.orderState?.transferId
      ? saved.orderState.transferId
      : null

  const transferExpired =
    savedTransferId !== null &&
    saved?.transferCreatedAt !== undefined &&
    Date.now() - saved.transferCreatedAt > TRANSFER_TIMEOUT_MS

  // Expired transfer: cancel it and reset to step 1.
  // Fresh transfer (no timestamp or < 5 min): drop back to confirm for a fresh deposit address.
  const savedTransferIdToCancel = savedTransferId

  const initialStep: Step = (() => {
    if (!savedTransferId) return 'verify-email'
    if (transferExpired) return 'verify-email'
    return 'confirm'
  })()

  const initialState: Partial<OrderState> = (() => {
    if (!savedTransferId) return {}
    if (transferExpired) return {}
    return {
      ...saved!.orderState,
      transferId: undefined,
      depositAddress: undefined,
    }
  })()

  const [step, setStep] = useState<Step>(initialStep)
  const [orderState, setOrderState] = useState<Partial<OrderState>>(initialState)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [transferCreatedAt, setTransferCreatedAt] = useState<number | undefined>(
    // Preserve the original timestamp if restoring a non-expired send session
    !transferExpired && savedTransferId ? saved?.transferCreatedAt : undefined,
  )

  // Cancel any stale transfer from a previous session (user closed tab mid-send)
  useEffect(() => {
    if (savedTransferIdToCancel) {
      cancelTransfer(savedTransferIdToCancel)
    }
    // If the transfer expired, also clear the session so refresh lands at step 1
    if (transferExpired) {
      clearSession()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist step + orderState (plus transferCreatedAt) to sessionStorage whenever state changes
  useEffect(() => {
    saveSession(step, orderState, transferCreatedAt)
  }, [step, orderState, transferCreatedAt])

  // Cancel any pending transfer if the user closes the tab / navigates away
  // while on the send step (i.e. they were shown a deposit address but never sent).
  useEffect(() => {
    const handleUnload = () => {
      const saved = loadSession()
      const tid = saved?.orderState?.transferId
      if (tid) cancelTransfer(tid)
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // Delete the recipient and reset to a clean state
  const cleanupRecipient = useCallback((state: Partial<OrderState>) => {
    if (state.recipientId) {
      deleteRecipient(state.recipientId).catch(() => {/* best-effort */})
    }
  }, [])

  // Called by any step when it receives a 401
  const handleSessionExpired = useCallback((state: Partial<OrderState>) => {
    if (state.transferId) cancelTransfer(state.transferId)
    cleanupRecipient(state)
    clearSession()
    setTransferCreatedAt(undefined)
    setOrderState({})
    setStep('verify-email')
    setSessionExpired(true)
    if (onError) onError(new Error('Session expired'))
  }, [cleanupRecipient, onError])

  function mergeState(data: Partial<OrderState>) {
    setOrderState((prev) => ({ ...prev, ...data }))
  }

  function handleEmailVerified(email: string, sessionToken: string, expiresIn: number) {
    setSessionToken(sessionToken, expiresIn)
    setSessionExpired(false)
    mergeState({ userEmail: email })
    setStep('amount')
  }

  function handleAmountNext(data: Partial<OrderState>) {
    setSessionExpired(false)
    mergeState(data)
    setStep('recipient')
  }

  function handleRecipientNext(data: Partial<OrderState>) {
    mergeState(data)
    setStep('confirm')
  }

  function handleConfirmNext(data: Partial<OrderState>) {
    setOrderState((prev) => ({ ...prev, ...data, recipientDetails: undefined }))
    setTransferCreatedAt(Date.now())
    setStep('send')
  }

  function handleBackToAmount() {
    setOrderState((prev) => ({
      ...prev,
      quoteId: undefined,
      quote: undefined,
    }))
    setStep('amount')
  }

  function handleBackToRecipient() {
    setStep('recipient')
  }

  function handleBackToConfirm() {
    // User is backing out of the send step — cancel the pending transfer so it
    // doesn't block future attempts.
    if (orderState.transferId) {
      cancelTransfer(orderState.transferId)
    }
    setTransferCreatedAt(undefined)
    setOrderState((prev) => ({
      ...prev,
      transferId: undefined,
      depositAddress: undefined,
    }))
    setStep('confirm')
  }

  function handleSendTimeout() {
    // User idled on the send step for 5 minutes without sending — cancel the
    // transfer and reset to the beginning so they start fresh.
    if (orderState.transferId) {
      cancelTransfer(orderState.transferId)
    }
    clearSession()
    cleanupRecipient(orderState)
    setTransferCreatedAt(undefined)
    setOrderState({})
    setStep('amount')
    if (onError) onError(new Error('Transfer timed out'))
  }

  function handleSuccess(transferId: string) {
    // Transaction finalized — clear session, delete recipient, reset to email verification
    clearSession()
    cleanupRecipient(orderState)
    setTransferCreatedAt(undefined)
    setOrderState({})
    setStep('verify-email')
    if (onSuccess) onSuccess(transferId)
  }


  return (
    <div>
      <div
        className="w-full max-w-md rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl backdrop-saturate-150"
        style={{
          boxShadow: '0 0 0 1px rgba(239,82,0,0.35), inset 0 1px 0 rgba(255,255,255,0.7), 0 8px 32px rgba(0,0,0,0.12), 0 0 24px rgba(239,82,0,0.1)',
        }}
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <img src="/mw.png" alt="Madhouse Wallet" className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Madhouse Wallet</span>
          </div>
          {step !== 'verify-email' && <StepIndicator current={step} />}
        </div>

        {/* Session expired banner */}
        {sessionExpired && (
          <div className="mb-4 rounded-xl border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 p-3 text-sm text-yellow-800 dark:text-yellow-300">
            Your session expired. Please start over.
          </div>
        )}

        {/* Step content */}
        <div>
          {step === 'verify-email' && (
            <EmailVerifyScreen onVerified={handleEmailVerified} />
          )}

          {step === 'amount' && (
            <AmountStep
              initialState={orderState}
              onNext={handleAmountNext}
              onSessionExpired={() => handleSessionExpired(orderState)}
              connectedEvmAddress={connectedEvmAddress}
              connectedSolanaAddress={connectedSolanaAddress}
            />
          )}

          {step === 'recipient' && (
            <RecipientStep
              orderState={orderState}
              onNext={handleRecipientNext}
              onBack={handleBackToAmount}
              onSessionExpired={() => handleSessionExpired(orderState)}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep
              orderState={orderState}
              onNext={handleConfirmNext}
              onBack={handleBackToRecipient}
              onSessionExpired={() => handleSessionExpired(orderState)}
            />
          )}

          {step === 'send' && (
            <SendStep
              orderState={orderState}
              onSuccess={handleSuccess}
              onBack={handleBackToConfirm}
              onTimeout={handleSendTimeout}
              connectedEvmAddress={connectedEvmAddress}
              connectedSolanaAddress={connectedSolanaAddress}
              evmProvider={evmProvider}
            />
          )}
        </div>
      </div>
    </div>
  )
}
