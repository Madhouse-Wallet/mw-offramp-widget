import React, { useState, useCallback, useEffect } from 'react'
import { StepIndicator } from './ui/StepIndicator'
import { AmountStep } from './steps/AmountStep'
import { RecipientStep } from './steps/RecipientStep'
import { ConfirmStep } from './steps/ConfirmStep'
import { SendStep } from './steps/SendStep'
import { WalletConnect } from './ui/WalletConnect'
import { deleteRecipient, cancelTransfer } from '../api/client'
import type { Step, OrderState, WidgetProps } from '../types'

const CHAIN_ID_MAP: Record<string, number> = {
  ethereum:  1,
  base:      8453,
  polygon:   137,
  arbitrum:  42161,
  avalanche: 43114,
}

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

export function OfframpWidget({ onSuccess }: WidgetProps) {
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
    if (!savedTransferId) return saved?.step ?? 'amount'
    if (transferExpired) return 'amount'
    return 'confirm'
  })()

  const initialState: Partial<OrderState> = (() => {
    if (!savedTransferId) return saved?.orderState ?? {}
    if (transferExpired) return {}
    return {
      ...saved!.orderState,
      transferId: undefined,
      depositAddress: undefined,
      depositAmount: undefined,
      depositCurrency: undefined,
    }
  })()

  const [step, setStep] = useState<Step>(initialStep)
  const [orderState, setOrderState] = useState<Partial<OrderState>>(initialState)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Wallet state — lifted here so the connect button lives in the persistent header
  const [walletAddress, setWalletAddress] = useState(initialState.walletAddress ?? '')
  const [walletNetwork, setWalletNetwork] = useState(initialState.sourceNetwork ?? '')
  const [walletChainId, setWalletChainId] = useState(initialState.connectedChainId)

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
      depositAmount: undefined,
      depositCurrency: undefined,
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
  }

  function handleSuccess(transferId: string) {
    // Transaction finalized — clear session, delete recipient, reset to step 1
    clearSession()
    cleanupRecipient(orderState)
    setTransferCreatedAt(undefined)
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
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <img src="/mw.png" alt="Madhouse Wallet" className="h-8 w-8 rounded-lg object-contain" />
              <span className="text-sm font-semibold text-gray-500">Madhouse Wallet</span>
            </div>
            <WalletConnect
              compact
              onConnected={(address, network) => {
                setWalletAddress(address)
                setWalletNetwork(network)
                setWalletChainId(CHAIN_ID_MAP[network])
              }}
              onDisconnected={() => {
                setWalletAddress('')
                setWalletNetwork('')
                setWalletChainId(undefined)
              }}
            />
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
              walletAddress={walletAddress}
              walletNetwork={walletNetwork}
              walletChainId={walletChainId}
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
              onTimeout={handleSendTimeout}
            />
          )}
        </div>
      </div>
    </div>
  )
}
