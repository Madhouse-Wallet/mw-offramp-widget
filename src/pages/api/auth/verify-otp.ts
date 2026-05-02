/**
 * POST /api/auth/verify-otp
 *
 * Verifies a reCAPTCHA token + a 6-digit OTP against the signed OTP JWT
 * issued by send-otp.ts. On success, issues a session JWT with audience
 * "mw-widget-proxy" — the same audience the proxy validates — so the client
 * can call all proxy endpoints without obtaining a token from widget-token.ts.
 *
 * Body:     { otpToken: string, code: string, email: string, captchaToken: string }
 * Response 200: { sessionToken: string, expiresIn: 7200 }
 * Response 400: { error: string }
 * Response 500: { error: string }
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { checkRateLimit, resetRateLimit } from '../../../lib/rate-limit'

const SESSION_TTL_SECONDS = 7200 // 2 hours
const MIN_CAPTCHA_SCORE = 0.5
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getSecret(): Uint8Array {
  const secret = process.env.WIDGET_JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('WIDGET_JWT_SECRET is not set or too short (min 32 chars)')
  }
  return new TextEncoder().encode(secret)
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

async function verifyCaptcha(token: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY
  if (!secretKey) return true // reCAPTCHA not configured — skip

  const params = new URLSearchParams({ secret: secretKey, response: token })
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = (await res.json()) as { success: boolean; score?: number }
  return data.success && (data.score === undefined || data.score >= MIN_CAPTCHA_SCORE)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { otpToken, code, email, captchaToken } = req.body as {
    otpToken?: unknown
    code?: unknown
    email?: unknown
    captchaToken?: unknown
  }

  // Basic input validation
  if (!otpToken || typeof otpToken !== 'string') {
    return res.status(400).json({ error: 'Missing OTP token' })
  }
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter a valid 6-digit code' })
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  const normalizedEmail = email.trim().toLowerCase()

  // IP rate limit — max 20 verify attempts per IP per 10-minute window
  const ip = (() => {
    const fwd = req.headers['x-forwarded-for']
    if (typeof fwd === 'string') return fwd.split(',')[0].trim()
    return req.socket.remoteAddress ?? 'unknown'
  })()
  const ipRl = checkRateLimit('verify-otp:ip', ip, 20, 10 * 60_000, 10 * 60_000)
  if (!ipRl.allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter: ipRl.retryAfter })
  }

  // Email rate limit — max 5 verify attempts per email per 10-minute window
  // Prevents brute-forcing the 6-digit OTP (900k combinations)
  const rl = checkRateLimit('verify-otp', normalizedEmail, 5, 10 * 60_000, 10 * 60_000)
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please request a new code.', retryAfter: rl.retryAfter })
  }

  // reCAPTCHA verification
  if (captchaToken && typeof captchaToken === 'string') {
    try {
      const passed = await verifyCaptcha(captchaToken)
      if (!passed) {
        return res.status(400).json({ error: 'Security check failed. Please try again.' })
      }
    } catch {
      return res.status(500).json({ error: 'Security check error. Please try again.' })
    }
  }

  try {
    const secret = getSecret()

    // Verify OTP JWT
    let payload: { emailHash?: string; otpHash?: string }
    try {
      const { payload: p } = await jwtVerify(otpToken, secret, {
        algorithms: ['HS256'],
        audience: 'mw-widget-otp',
      })
      payload = p as typeof payload
    } catch {
      return res.status(400).json({ error: 'Invalid or expired verification code' })
    }

    // Compare hashes
    if (payload.emailHash !== sha256(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid or expired verification code' })
    }
    if (payload.otpHash !== sha256(code)) {
      return res.status(400).json({ error: 'Invalid or expired verification code' })
    }

    // Clear rate limit on success so a re-verify after expiry works cleanly
    resetRateLimit('verify-otp', normalizedEmail)

    // Issue session JWT — same shape as widget-token.ts used to issue,
    // audience "mw-widget-proxy" so the proxy accepts it without any changes
    const sessionToken = await new SignJWT({ scope: 'widget-proxy' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .setAudience('mw-widget-proxy')
      .sign(secret)

    return res.status(200).json({ sessionToken, expiresIn: SESSION_TTL_SECONDS })
  } catch (err) {
    console.error('[verify-otp] error:', err)
    return res.status(500).json({ error: 'Verification failed. Please try again.' })
  }
}
