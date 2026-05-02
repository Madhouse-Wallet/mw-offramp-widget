import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Button } from './Button'
import { verifyOtp } from '../../api/client'
import type { OtpVerifyResponse } from '../../types'

interface OtpModalProps {
  email: string
  otpToken: string
  resendCount: number
  cooldownUntil: Date | null
  sending: boolean
  onVerified: (sessionToken: string, expiresIn: number) => void
  onClose: () => void
  onResend: () => Promise<void>
}

export function OtpModal({
  email,
  otpToken,
  resendCount,
  cooldownUntil,
  sending,
  onVerified,
  onClose,
  onResend,
}: OtpModalProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState<number>(0)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mount guard — prevents accessing document on the server
  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-focus the code input when modal opens
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownUntil) {
      setCountdown(0)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil.getTime() - Date.now()) / 1000))
      setCountdown(remaining)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [cooldownUntil])

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  async function handleVerify() {
    if (verifying || code.length !== 6) return
    setError(null)
    setVerifying(true)
    try {
      let result: OtpVerifyResponse
      try {
        result = await verifyOtp(otpToken, code, email, null)
      } catch (err) {
        const e = err as Error
        setError(e.message || 'Invalid or expired code. Please try again.')
        return
      }
      onVerified(result.sessionToken, result.expiresIn)
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    if (resending || resendCount >= 3 || countdown > 0) return
    setResending(true)
    setError(null)
    setCode('')
    try {
      await onResend()
    } catch (err) {
      const e = err as Error
      setError(e.message || 'Failed to resend code. Please try again.')
    } finally {
      setResending(false)
    }
  }

  const isCoolingDown = countdown > 0
  const canVerify = code.length === 6 && !verifying && !isCoolingDown && !sending
  const canResend = resendCount < 3 && !resending && !isCoolingDown && !sending

  if (!mounted) return null

  return ReactDOM.createPortal(
    <>
      {/* Full-screen blur overlay — covers the entire page behind the modal */}
      <div
        className="fixed inset-0 z-40"
        style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', background: 'rgba(0,0,0,0.45)' }}
        aria-hidden="true"
      />

      {/* Modal card — centred above the blur overlay */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="otp-modal-title"
      >
        <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700">
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fa4536]"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#ef5200]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 id="otp-modal-title" className="text-base font-semibold text-gray-900 dark:text-white">
            Check your email
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            We sent a 6-digit code to <span className="font-medium text-gray-700 dark:text-gray-300">{email}</span>. It expires in 10 minutes.
          </p>
        </div>

        {/* Cooldown banner */}
        {isCoolingDown && (
          <div className="mb-4 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-4 py-3 text-sm text-orange-800 dark:text-orange-300">
            Too many attempts. Try again in <span className="font-semibold tabular-nums">{formatCountdown(countdown)}</span>.
          </div>
        )}

        {/* Code input */}
        <div className="mb-4">
          <label htmlFor="otp-code" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Verification code
          </label>
          <input
            ref={inputRef}
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            disabled={isCoolingDown || sending}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(val)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleVerify()
            }}
            className="block w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:border-[#fa4536] focus:outline-none focus:ring-1 focus:ring-[#fa4536] disabled:opacity-50"
          />
          {error && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Verify button */}
        <Button
          variant="primary"
          fullWidth
          disabled={!canVerify}
          loading={verifying || sending}
          onClick={() => { void handleVerify() }}
        >
          {verifying ? 'Verifying…' : 'Verify'}
        </Button>

        {/* Resend */}
        <div className="mt-4 text-center">
          <span className="text-sm text-gray-500 dark:text-gray-400">Didn&apos;t receive it?{' '}</span>
          {resendCount >= 3 ? (
            <span className="text-sm text-gray-400 dark:text-gray-500">Maximum resends reached.</span>
          ) : (
            <button
              type="button"
              onClick={() => { void handleResend() }}
              disabled={!canResend}
              className="text-sm font-medium text-[#ef5200] hover:text-[#fa4536] disabled:text-gray-400 disabled:cursor-not-allowed focus:outline-none focus-visible:underline"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
          {resendCount > 0 && resendCount < 3 && (
            <span className="ml-1 text-xs text-gray-400">({3 - resendCount} left)</span>
          )}
        </div>
        </div>
      </div>
    </>,
    document.body
  )
}
