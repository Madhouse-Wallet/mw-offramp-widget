/**
 * POST /api/auth/verify-captcha
 *
 * Verifies a reCAPTCHA v3 token server-side using the same RECAPTCHA_SECRET_KEY
 * env var as the main stripe-direct-debit app.
 *
 * When RECAPTCHA_SECRET_KEY is not configured, verification is skipped and the
 * request succeeds — matching the main app's behaviour.
 *
 * Body: { token: string }
 * Response: { success: true } | { error: string }
 */
import type { NextApiRequest, NextApiResponse } from 'next'

const MIN_SCORE = 0.5

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) {
    // No secret configured — skip verification (matches main app behaviour)
    return res.status(200).json({ success: true })
  }

  const { token } = req.body as { token?: string }
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing captcha token' })
  }

  try {
    const params = new URLSearchParams({ secret, response: token })
    const googleRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const data = (await googleRes.json()) as {
      success: boolean
      score?: number
      action?: string
      'error-codes'?: string[]
    }

    if (!data.success || (data.score !== undefined && data.score < MIN_SCORE)) {
      return res.status(400).json({ error: 'Captcha verification failed' })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[verify-captcha] error:', err)
    return res.status(500).json({ error: 'Captcha verification error' })
  }
}
