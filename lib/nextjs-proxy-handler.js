/**
 * mw-offramp Next.js proxy route handler
 *
 * Drop this file into your Next.js project as a catch-all API route:
 *
 *   Pages Router:  pages/api/mw-proxy/[...path].js
 *   App Router:    app/api/mw-proxy/[...path]/route.js
 *
 * Then set these environment variables in your .env.local:
 *
 *   WIDGET_API_KEY=mw_live_...
 *   WIDGET_USER_ID=your-user-id
 *
 * And configure the widget to point here:
 *
 *   configureClient({ proxyUrl: '/api/mw-proxy' })
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDING YOUR OWN AUTH
 * ─────────────────────────────────────────────────────────────────────────────
 * The handler below accepts all requests. In production you should gate it
 * behind your session auth. Example with NextAuth:
 *
 *   import { getServerSession } from 'next-auth'
 *   import { authOptions } from '../auth/[...nextauth]'
 *
 *   // Inside the handler, before the proxy logic:
 *   const session = await getServerSession(req, res, authOptions)
 *   if (!session) return res.status(401).json({ error: 'Unauthorized' })
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAGES ROUTER  (pages/api/mw-proxy/[...path].js)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Shared constants ─────────────────────────────────────────────────────────

const UPSTREAM_BASE = (process.env.WIDGET_API_BASE_URL || 'https://business.madhousewallet.com').replace(/\/$/, '')

const ALLOWED_PATH_PREFIXES = [
  'payouts/quote',
  'payouts/transfer/cancel',
  'payouts/transfer',
  'payouts/recipients',
  'payouts/account-requirements',
  'payouts/deposit-options',
  'payouts/fee',
]

const NEEDS_USER_ID = [
  { path: 'payouts/recipients', method: 'POST' },
  { path: 'payouts/transfer',   method: 'POST' },
]

function isAllowedPath(segments) {
  const joined = segments.join('/')
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) => joined === prefix || joined.startsWith(prefix + '/'),
  )
}

function needsUserId(segments, method) {
  const joined = segments.join('/')
  return NEEDS_USER_ID.some(
    (rule) => joined === rule.path && method.toUpperCase() === rule.method,
  )
}

// ─── Pages Router handler ─────────────────────────────────────────────────────

/**
 * Usage: pages/api/mw-proxy/[...path].js
 *
 * export { config } from this file as well, or copy the config export below.
 */

export const config = {
  api: { bodyParser: true },
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiKey = process.env.WIDGET_API_KEY
  const userId = process.env.WIDGET_USER_ID

  if (!apiKey) return res.status(503).json({ error: 'WIDGET_API_KEY is not configured' })
  if (!userId) return res.status(503).json({ error: 'WIDGET_USER_ID is not configured' })

  const segments = (req.query.path ?? [])
  if (!isAllowedPath(segments)) return res.status(404).json({ error: 'Not found' })

  const method = req.method.toUpperCase()

  let body = method !== 'GET' && method !== 'DELETE' ? req.body : undefined
  if (needsUserId(segments, method)) {
    body = { ...body, user_id: userId }
  }

  // Forward query params (strip Next.js internal "path" param)
  const query = { ...req.query }
  delete query.path
  const qs = new URLSearchParams(query).toString()
  const upstreamUrl = `${UPSTREAM_BASE}/api/${segments.join('/')}${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
    })

    const text = await upstream.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }

    res.status(upstream.status).json(data)
  } catch (err) {
    console.error('[mw-proxy] upstream error:', err)
    res.status(502).json({ error: 'Upstream request failed' })
  }
}

// ─── App Router handler ───────────────────────────────────────────────────────

/**
 * Usage: app/api/mw-proxy/[...path]/route.js
 *
 * Copy just this section into route.js — it does not use `req`/`res` style.
 */

async function appRouterHandler(request, { params }) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  const apiKey = process.env.WIDGET_API_KEY
  const userId = process.env.WIDGET_USER_ID

  if (!apiKey) return Response.json({ error: 'WIDGET_API_KEY is not configured' }, { status: 503, headers: corsHeaders })
  if (!userId) return Response.json({ error: 'WIDGET_USER_ID is not configured' }, { status: 503, headers: corsHeaders })

  const segments = (await params).path ?? []
  if (!isAllowedPath(segments)) return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders })

  const method = request.method.toUpperCase()

  let body
  if (method !== 'GET' && method !== 'DELETE') {
    try { body = await request.json() } catch { body = undefined }
  }

  if (needsUserId(segments, method)) {
    body = { ...body, user_id: userId }
  }

  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const upstreamUrl = `${UPSTREAM_BASE}/api/${segments.join('/')}${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
    })

    const text = await upstream.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }

    return new Response(JSON.stringify(data), { status: upstream.status, headers: corsHeaders })
  } catch (err) {
    console.error('[mw-proxy] upstream error:', err)
    return Response.json({ error: 'Upstream request failed' }, { status: 502, headers: corsHeaders })
  }
}

// Export App Router methods (ignored when used as Pages Router handler)
export const GET    = (req, ctx) => appRouterHandler(req, ctx)
export const POST   = (req, ctx) => appRouterHandler(req, ctx)
export const DELETE = (req, ctx) => appRouterHandler(req, ctx)
