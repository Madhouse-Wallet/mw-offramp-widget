import type { NextApiRequest, NextApiResponse } from 'next'
import { jwtVerify } from 'jose'
import { hexToKey, encryptPayload, decryptPayload } from '../../../lib/payload-crypto'

export const config = {
  api: { bodyParser: true },
}

const ALLOWED_PATH_PREFIXES = [
  'payouts/quote',
  'payouts/transfer',
  'payouts/recipients',
  'payouts/account-requirements',
  'payouts/deposit-options',
  'payouts/transfer-status',
  'payouts/transfer/cancel',
  'payouts/fee',
]

function isAllowedPath(pathParts: string[]): boolean {
  const joined = pathParts.join('/')
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) => joined === prefix || joined.startsWith(prefix + '/'),
  )
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.WIDGET_JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('WIDGET_JWT_SECRET is not set or too short')
  }
  return new TextEncoder().encode(secret)
}

function getEncryptKey(): Uint8Array {
  const hex = process.env.WIDGET_ENCRYPT_SECRET
  if (!hex) throw new Error('WIDGET_ENCRYPT_SECRET is not set')
  return hexToKey(hex)
}

async function verifyWidgetToken(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  try {
    await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      audience: 'mw-widget-proxy',
    })
    return true
  } catch {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS — allow any origin so the widget can be embedded anywhere
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Verify widget JWT — ensures only our own frontend can call the proxy
  const authorized = await verifyWidgetToken(req.headers.authorization)
  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const pathParts = (req.query.path as string[]) ?? []
  if (!isAllowedPath(pathParts)) {
    return res.status(404).json({ error: 'Not found' })
  }

  const apiKey = process.env.WIDGET_API_KEY
  if (!apiKey) {
    console.error('[proxy] WIDGET_API_KEY is not set')
    return res.status(503).json({ error: 'Service unavailable' })
  }

  const encryptKey = getEncryptKey()

  // Decrypt request body if present (browser sends { jwe: "<compact-jwe>" })
  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'DELETE' && req.body != null
  let plainBody: unknown = undefined
  if (hasBody) {
    const raw = req.body as { jwe?: string }
    if (typeof raw?.jwe === 'string') {
      try {
        plainBody = await decryptPayload(raw.jwe, encryptKey)
      } catch {
        return res.status(400).json({ error: 'Invalid encrypted payload' })
      }
    } else {
      return res.status(400).json({ error: 'Request body must be encrypted' })
    }
  }

  const apiBase = process.env.WIDGET_API_BASE_URL ?? 'https://business.madhousewallet.com'
  const targetPath = `/api/${pathParts.join('/')}`

  // Forward query params (minus the Next.js "path" param)
  const query = { ...req.query }
  delete query.path
  const qs = new URLSearchParams(query as Record<string, string>).toString()
  const fullPath = qs ? `${targetPath}?${qs}` : targetPath
  const targetUrl = `${apiBase.replace(/\/$/, '')}${fullPath}`

  const bodyStr = plainBody !== undefined ? JSON.stringify(plainBody) : undefined

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      ...(bodyStr ? { body: bodyStr } : {}),
    })

    const responseText = await upstream.text()

    // Parse upstream response then encrypt before sending to browser
    let responseData: unknown
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = responseText
    }

    res.setHeader('Content-Type', 'application/json')
    // Only encrypt successful responses. Error responses are returned as plain
    // JSON so the client can read the error message directly.
    if (upstream.ok) {
      const jwe = await encryptPayload(responseData, encryptKey)
      return res.status(upstream.status).json({ jwe })
    } else {
      return res.status(upstream.status).json(responseData)
    }
  } catch (err) {
    console.error('[proxy] upstream fetch error:', err)
    return res.status(502).json({ error: 'Upstream request failed' })
  }
}
