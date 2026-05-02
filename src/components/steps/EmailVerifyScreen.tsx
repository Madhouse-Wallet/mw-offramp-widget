import React, { useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { OtpModal } from '../ui/OtpModal'
import { sendOtp, executeCaptcha } from '../../api/client'

interface EmailVerifyScreenProps {
  onVerified: (email: string, sessionToken: string, expiresIn: number) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailVerifyScreen({ onVerified }: EmailVerifyScreenProps) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [resendCount, setResendCount] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null)
  const [showModal, setShowModal] = useState(false)

  function validateEmail(): boolean {
    const trimmed = email.trim()
    if (!trimmed) {
      setEmailError('Email address is required')
      return false
    }
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError('Enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  async function handleSend() {
    if (!validateEmail() || sending) return
    setSendError(null)
    setSending(true)
    try {
      const captchaToken = await executeCaptcha('send_otp')
      const resp = await sendOtp(email, captchaToken)
      setOtpToken(resp.otpToken)
      setResendCount(1)
      setCooldownUntil(null)
      setShowModal(true)
    } catch (err) {
      const e = err as Error & { status?: number; retryAfter?: number }
      if (e.status === 429 && typeof e.retryAfter === 'number') {
        setCooldownUntil(new Date(Date.now() + e.retryAfter * 1000))
        setSendError(`Too many attempts. Please try again in ${Math.ceil(e.retryAfter / 60)} minute${e.retryAfter >= 120 ? 's' : ''}.`)
      } else {
        setSendError(e.message || 'Failed to send verification code. Please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  async function handleResend() {
    const captchaToken = await executeCaptcha('send_otp')
    const resp = await sendOtp(email, captchaToken)
    setOtpToken(resp.otpToken)
    setResendCount((c) => c + 1)
    setCooldownUntil(null)
  }

  function handleModalClose() {
    setShowModal(false)
    setOtpToken(null)
    // Keep resendCount so the user sees they've already used some attempts if they reopen
  }

  function handleVerified(sessionToken: string, expiresIn: number) {
    setShowModal(false)
    onVerified(email.trim().toLowerCase(), sessionToken, expiresIn)
  }

  return (
    <>
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Verify your email</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Enter your email address to receive a one-time verification code before you continue.
          </p>
        </div>

        <div>
          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailError(null)
              setSendError(null)
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') void handleSend()
            }}
            error={emailError ?? undefined}
            required
          />
          {sendError && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{sendError}</p>
          )}
        </div>

        <Button
          variant="primary"
          fullWidth
          disabled={!email.trim() || sending}
          loading={sending}
          onClick={() => { void handleSend() }}
        >
          {sending ? 'Sending code…' : 'Send Verification Code'}
        </Button>
      </div>

      {showModal && otpToken && (
        <OtpModal
          email={email.trim().toLowerCase()}
          otpToken={otpToken}
          resendCount={resendCount}
          cooldownUntil={cooldownUntil}
          sending={sending}
          onVerified={handleVerified}
          onClose={handleModalClose}
          onResend={handleResend}
        />
      )}
    </>
  )
}
