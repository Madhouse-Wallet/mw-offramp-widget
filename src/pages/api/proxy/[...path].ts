import type { NextApiRequest, NextApiResponse } from 'next'
import { jwtVerify } from 'jose'

export const config = {
  api: { bodyParser: true },
}

const ALLOWED_PATH_PREFIXES = [
  'payouts/quote',
  'payouts/transfer',
  'payouts/recipients',
  'payouts/account-requirements',
  'payouts/deposit-options',
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

  const apiBase = process.env.WIDGET_API_BASE_URL ?? 'https://business.madhousewallet.com'
  const targetPath = `/api/${pathParts.join('/')}`

  // Forward query params (minus the Next.js "path" param)
  const query = { ...req.query }
  delete query.path
  const qs = new URLSearchParams(query as Record<string, string>).toString()
  const fullPath = qs ? `${targetPath}?${qs}` : targetPath
  const targetUrl = `${apiBase.replace(/\/$/, '')}${fullPath}`

  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'DELETE' && req.body != null
  const bodyStr = hasBody ? JSON.stringify(req.body) : undefined

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
    res.setHeader('Content-Type', 'application/json')
    return res.status(upstream.status).send(responseText)
  } catch (err) {
    console.error('[proxy] upstream fetch error:', err)
    return res.status(502).json({ error: 'Upstream request failed' })
  }
}
