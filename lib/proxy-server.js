#!/usr/bin/env node
/**
 * mw-offramp proxy server
 *
 * A minimal Express reverse proxy that sits between the widget and the
 * Madhouse Wallet business API. Run this on your backend — it holds your
 * API credentials and never exposes them to the browser.
 *
 * Usage:
 *   node proxy-server.js <WIDGET_API_KEY> <WIDGET_USER_ID> [port]
 *
 * Arguments:
 *   WIDGET_API_KEY   Your Madhouse Wallet API key (mw_live_...)
 *   WIDGET_USER_ID   Your Madhouse Wallet user ID
 *   port             Port to listen on (default: 3001)
 *
 * The widget must be configured to point at this server:
 *   configureClient({ proxyUrl: 'http://localhost:3001' })
 *
 * What this proxy does:
 *   - Accepts requests from the widget on /payouts/...
 *   - Enforces an allowlist of paths (SSRF protection)
 *   - Injects WIDGET_API_KEY as Authorization: Bearer on every upstream request
 *   - Injects WIDGET_USER_ID into recipient and transfer request bodies
 *   - Forwards to https://business.madhousewallet.com/api/payouts/...
 *   - Sets CORS headers so the widget can call it from any origin
 *
 * What you add on top (optional):
 *   - Your own auth middleware (session token, API key check, etc.)
 *   - Rate limiting
 *   - Request logging
 */

'use strict'

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

const WIDGET_API_KEY = args[0] || process.env.WIDGET_API_KEY
const WIDGET_USER_ID = args[1] || process.env.WIDGET_USER_ID
const PORT = parseInt(args[2] || process.env.PORT || '3001', 10)

if (!WIDGET_API_KEY) {
  console.error('Error: WIDGET_API_KEY is required.')
  console.error('Usage: node proxy-server.js <WIDGET_API_KEY> <WIDGET_USER_ID> [port]')
  process.exit(1)
}

if (!WIDGET_USER_ID) {
  console.error('Error: WIDGET_USER_ID is required.')
  console.error('Usage: node proxy-server.js <WIDGET_API_KEY> <WIDGET_USER_ID> [port]')
  process.exit(1)
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

let express
try {
  express = require('express')
} catch {
  console.error('Express is not installed. Run: npm install express')
  process.exit(1)
}

// ─── Config ───────────────────────────────────────────────────────────────────

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

// Paths where user_id must be injected into the request body server-side
const NEEDS_USER_ID = [
  { path: 'payouts/recipients', method: 'POST' },
  { path: 'payouts/transfer',   method: 'POST' },
]

// ─── Path validation ──────────────────────────────────────────────────────────

function isAllowedPath(urlPath) {
  // Strip leading slash, e.g. "/payouts/quote" → "payouts/quote"
  const stripped = urlPath.replace(/^\/+/, '')
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) => stripped === prefix || stripped.startsWith(prefix + '/'),
  )
}

function needsUserId(urlPath, method) {
  const stripped = urlPath.replace(/^\/+/, '')
  return NEEDS_USER_ID.some(
    (rule) => stripped === rule.path && method.toUpperCase() === rule.method,
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

// CORS — allow the widget to call this proxy from any origin.
// Restrict Access-Control-Allow-Origin to your own domain in production.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  next()
})

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }))

// ─── Proxy handler ────────────────────────────────────────────────────────────

app.all('/*splat', async (req, res) => {
  const urlPath = req.path

  if (!isAllowedPath(urlPath)) {
    return res.status(404).json({ error: 'Not found' })
  }

  const method = req.method.toUpperCase()

  // Inject WIDGET_USER_ID into bodies that need it
  let body = req.body
  if (needsUserId(urlPath, method)) {
    body = { ...body, user_id: WIDGET_USER_ID }
  }

  // Build upstream URL — preserve query string
  const qs = new URLSearchParams(req.query).toString()
  const upstreamPath = `/api${urlPath}`
  const upstreamUrl = qs
    ? `${UPSTREAM_BASE}${upstreamPath}?${qs}`
    : `${UPSTREAM_BASE}${upstreamPath}`

  const hasBody = method !== 'GET' && method !== 'DELETE' && body != null && Object.keys(body).length > 0

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WIDGET_API_KEY}`,
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    })

    const text = await upstream.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }

    res.status(upstream.status).json(data)
  } catch (err) {
    console.error('[proxy] upstream error:', err)
    res.status(502).json({ error: 'Upstream request failed' })
  }
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`mw-offramp proxy running on port ${PORT}`)
  console.log(`Forwarding to: ${UPSTREAM_BASE}`)
  console.log(`API key: ${WIDGET_API_KEY.slice(0, 8)}...`)
})
