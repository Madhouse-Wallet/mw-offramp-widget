/**
 * POST /api/auth/send-otp
 *
 * Generates a 6-digit OTP, emails it via Amazon SES, and returns a signed
 * short-lived JWT containing the hashed email + hashed OTP.
 *
 * Rate limits (per email address, in-memory — resets on server restart):
 *   - Max 3 sends in any 5-minute window
 *   - On the 4th attempt within the window: 30-minute cooldown imposed
 *
 * Body:   { email: string }
 * Response 200: { otpToken: string, expiresIn: 600 }
 * Response 400: { error: string }
 * Response 429: { error: 'cooldown', retryAfter: number }
 * Response 500: { error: string }
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { SignJWT } from 'jose'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { checkRateLimit } from '../../../lib/rate-limit'

const ses = new SESClient({ region: process.env.REGION ?? 'us-east-1' })

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress ?? 'unknown'
}

// ─── reCAPTCHA verification ───────────────────────────────────────────────────

async function verifyCaptcha(token: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) return true // reCAPTCHA not configured — skip
  try {
    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    })
    const data = (await resp.json()) as { success: boolean; score?: number }
    return data.success && (data.score ?? 1) >= 0.5
  } catch {
    return false
  }
}

const OTP_TTL_SECONDS = 600 // 10 minutes

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── JWT helpers ──────────────────────────────────────────────────────────────

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

function buildEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12)">
    <div style="background:#ef5200;padding:24px 32px">
      <span style="color:#ffffff;font-size:18px;font-weight:700">Madhouse Wallet</span>
    </div>
    <div style="padding:32px">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Your verification code</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280">Enter this code to verify your email address. It expires in 10 minutes.</p>
      <div style="display:inline-block;background:#f3f4f6;border-radius:8px;padding:16px 32px;margin-bottom:24px">
        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111827">${code}</span>
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af">If you did not request this code, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, captchaToken } = req.body as { email?: unknown; captchaToken?: unknown }

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required' })
  }

  const normalizedEmail = email.trim().toLowerCase()

  // Captcha check — before rate limit so bots don't burn rate limit slots
  if (captchaToken && typeof captchaToken === 'string') {
    const passed = await verifyCaptcha(captchaToken)
    if (!passed) {
      return res.status(400).json({ error: 'Security check failed. Please try again.' })
    }
  }

  // IP rate limit — max 10 sends per IP per 10-minute window
  const ip = getClientIp(req)
  const ipRl = checkRateLimit('send-otp:ip', ip, 10, 10 * 60_000, 30 * 60_000)
  if (!ipRl.allowed) {
    return res.status(429).json({ error: 'cooldown', retryAfter: ipRl.retryAfter })
  }

  // Email rate limit — max 3 sends per 5-minute window, 30-minute cooldown
  const emailRl = checkRateLimit('send-otp:email', normalizedEmail, 3, 5 * 60_000, 30 * 60_000)
  if (!emailRl.allowed) {
    return res.status(429).json({ error: 'cooldown', retryAfter: emailRl.retryAfter })
  }

  try {
    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString()

    // Build signed OTP JWT
    const secret = getSecret()
    const otpToken = await new SignJWT({
      emailHash: sha256(normalizedEmail),
      otpHash: sha256(otp),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${OTP_TTL_SECONDS}s`)
      .setAudience('mw-widget-otp')
      .sign(secret)

    // Send email
    const from = process.env.SES_FROM_ADDRESS
    if (!from) throw new Error('SES_FROM_ADDRESS is not configured')

    await ses.send(new SendEmailCommand({
      Source: `Madhouse Wallet <${from}>`,
      Destination: { ToAddresses: [normalizedEmail] },
      Message: {
        Subject: { Data: `${otp} is your Madhouse Wallet verification code` },
        Body: {
          Text: { Data: `Your verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, you can safely ignore this email.` },
          Html: { Data: buildEmailHtml(otp) },
        },
      },
    }))

    return res.status(200).json({ otpToken, expiresIn: OTP_TTL_SECONDS })
  } catch (err) {
    console.error('[send-otp] error:', err)
    return res.status(500).json({ error: 'Failed to send verification code. Please try again.' })
  }
}
