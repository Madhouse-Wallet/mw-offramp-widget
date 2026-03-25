import type { NextApiRequest, NextApiResponse } from 'next'
import { SignJWT } from 'jose'

const TOKEN_TTL_SECONDS = 3600 // 1 hour

function getSecret(): Uint8Array {
  const secret = process.env.WIDGET_JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('WIDGET_JWT_SECRET is not set or too short (min 32 chars)')
  }
  return new TextEncoder().encode(secret)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const secret = getSecret()
    const token = await new SignJWT({ scope: 'widget-proxy' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
      .setAudience('mw-widget-proxy')
      .sign(secret)

    return res.status(200).json({ token, expiresIn: TOKEN_TTL_SECONDS })
  } catch (err) {
    console.error('[widget-token] error:', err)
    return res.status(500).json({ error: 'Failed to issue token' })
  }
}
