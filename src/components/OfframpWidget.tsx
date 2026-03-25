import React, { useState, useCallback, useEffect } from 'react'
import { StepIndicator } from './ui/StepIndicator'
import { AmountStep } from './steps/AmountStep'
import { RecipientStep } from './steps/RecipientStep'
import { ConfirmStep } from './steps/ConfirmStep'
import { SendStep } from './steps/SendStep'
import { deleteRecipient, cancelTransfer } from '../api/client'
import type { Step, OrderState, WidgetProps } from '../types'

const SESSION_KEY = 'mw_widget_state'

function saveSession(step: Step, orderState: Partial<OrderState>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ step, orderState }))
  } catch {
    // sessionStorage unavailable (e.g. private browsing restrictions) — silently ignore
  }
}

function loadSession(): { step: Step; orderState: Partial<OrderState> } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { step: Step; orderState: Partial<OrderState> }
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

export function OfframpWidget({ onSuccess, onError }: WidgetProps) {
  const saved = loadSession()

  // If the session was saved mid-send (transferId exists), cancel the stale transfer
  // on mount and drop back to confirm so the user gets a fresh deposit address.
  const savedTransferIdToCancel =
    saved?.step === 'send' && saved?.orderState?.transferId
      ? saved.orderState.transferId
      : null

  const initialStep: Step =
    savedTransferIdToCancel ? 'confirm' : (saved?.step ?? 'amount')
  const initialState: Partial<OrderState> = savedTransferIdToCancel
    ? {
        ...saved!.orderState,
        transferId: undefined,
        depositAddress: undefined,
        depositAmount: undefined,
        depositCurrency: undefined,
      }
    : (saved?.orderState ?? {})

  const [step, setStep] = useState<Step>(initialStep)
  const [orderState, setOrderState] = useState<Partial<OrderState>>(initialState)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Cancel any stale transfer from a previous session (user closed tab mid-send)
  useEffect(() => {
    if (savedTransferIdToCancel) {
      cancelTransfer(savedTransferIdToCancel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist step + orderState to sessionStorage whenever either changes
  useEffect(() => {
    saveSession(step, orderState)
  }, [step, orderState])

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
    setOrderState({})
    setStep('amount')
    setSessionExpired(true)
  }, [cleanupRecipient])

  function mergeState(data: Partial<OrderState>) {
    setOrderState((prev) => ({ ...prev, ...data }))
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
    mergeState(data)
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
    setOrderState((prev) => ({
      ...prev,
      transferId: undefined,
      depositAddress: undefined,
      depositAmount: undefined,
      depositCurrency: undefined,
    }))
    setStep('confirm')
  }

  function handleSuccess(transferId: string) {
    // Transaction finalized — clear session, delete recipient, reset to step 1
    clearSession()
    cleanupRecipient(orderState)
    setOrderState({})
    setStep('amount')
    if (onSuccess) onSuccess(transferId)
  }

  return (
    <div>
      {/* Title above the card */}
      <h1 className="mb-4 text-center text-2xl font-bold text-gray-900">Sell Coins Now</h1>

      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-200">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <img src="/mw.png" alt="Madhouse Wallet" className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-sm font-semibold text-gray-500">Madhouse Wallet</span>
          </div>
          <StepIndicator current={step} />
        </div>

        {/* Session expired banner */}
        {sessionExpired && (
          <div className="mb-4 rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            Your session expired. Please start over.
          </div>
        )}

        {/* Step content */}
        <div>
          {step === 'amount' && (
            <AmountStep
              initialState={orderState}
              onNext={handleAmountNext}
              onSessionExpired={() => handleSessionExpired(orderState)}
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
            />
          )}
        </div>
      </div>
    </div>
  )
}
