import type { NextApiRequest, NextApiResponse } from 'next'
import { hexToKey } from '../../../lib/payload-crypto'

/**
 * Returns the AES-256-GCM encryption key as a base64url string so the browser
 * can import it and use it for payload encryption/decryption.
 *
 * Only served over same-origin (no external auth required — same threat model
 * as /api/auth/widget-token: any same-origin caller can obtain it).
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const key = hexToKey(process.env.WIDGET_ENCRYPT_SECRET ?? '')
    // Encode as base64url for safe transport
    const b64 = Buffer.from(key).toString('base64url')
    return res.status(200).json({ key: b64 })
  } catch (err) {
    console.error('[widget-key] error:', err)
    return res.status(500).json({ error: 'Encryption key unavailable' })
  }
}
