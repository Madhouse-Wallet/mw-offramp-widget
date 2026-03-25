import React, { useState, useCallback } from 'react'
import { StepIndicator } from './ui/StepIndicator'
import { AmountStep } from './steps/AmountStep'
import { RecipientStep } from './steps/RecipientStep'
import { ConfirmStep } from './steps/ConfirmStep'
import { SendStep } from './steps/SendStep'
import { deleteRecipient } from '../api/client'
import type { Step, OrderState, WidgetProps } from '../types'

export function OfframpWidget({ onSuccess, onError }: WidgetProps) {
  const [step, setStep] = useState<Step>('amount')
  const [orderState, setOrderState] = useState<Partial<OrderState>>({})
  const [sessionExpired, setSessionExpired] = useState(false)

  // Delete the recipient and reset to a clean state
  const cleanupRecipient = useCallback((state: Partial<OrderState>) => {
    if (state.recipientId) {
      deleteRecipient(state.recipientId).catch(() => {/* best-effort */})
    }
  }, [])

  // Called by any step when it receives a 401
  const handleSessionExpired = useCallback((state: Partial<OrderState>) => {
    cleanupRecipient(state)
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

  function handleSuccess(transferId: string) {
    // Transaction finalized — delete the recipient
    cleanupRecipient(orderState)
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
            />
          )}
        </div>
      </div>
    </div>
  )
}
