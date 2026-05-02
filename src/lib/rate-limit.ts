/**
 * Minimal in-memory fixed-window rate limiter for Next.js API routes.
 * State resets on server restart — sufficient for abuse prevention.
 * For multi-instance deployments, replace with a Redis-backed solution.
 *
 * Usage:
 *   const { allowed, retryAfter } = checkRateLimit('store-name', key, 5, 10 * 60_000, 10 * 60_000)
 *   if (!allowed) return res.status(429).json({ error: 'Too many requests', retryAfter })
 */

interface RateEntry {
  count: number
  windowStart: number
  lockedUntil?: number
}

const stores = new Map<string, Map<string, RateEntry>>()

function getStore(name: string): Map<string, RateEntry> {
  if (!stores.has(name)) stores.set(name, new Map())
  return stores.get(name)!
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number // seconds until the client may retry
}

/**
 * Check (and increment) a rate limit counter.
 *
 * @param storeName  Logical namespace for this counter (e.g. 'verify-otp')
 * @param key        Per-client key (e.g. email, IP address)
 * @param maxRequests  Max requests allowed in the window before locking
 * @param windowMs   Rolling window duration in milliseconds
 * @param lockMs     Lockout duration in milliseconds after exceeding maxRequests
 */
export function checkRateLimit(
  storeName: string,
  key: string,
  maxRequests: number,
  windowMs: number,
  lockMs: number,
): RateLimitResult {
  const now = Date.now()
  const store = getStore(storeName)
  const entry = store.get(key) ?? { count: 0, windowStart: now }

  // Under an active lockout?
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) }
  }

  // Reset window if it has expired
  if (now - entry.windowStart > windowMs) {
    entry.count = 0
    entry.windowStart = now
    entry.lockedUntil = undefined
  }

  if (entry.count >= maxRequests) {
    // First request that overflows — impose lockout
    entry.lockedUntil = now + lockMs
    store.set(key, entry)
    return { allowed: false, retryAfter: Math.ceil(lockMs / 1000) }
  }

  entry.count += 1
  store.set(key, entry)
  return { allowed: true }
}

/**
 * Clear the rate limit record for a key (e.g. on successful auth).
 */
export function resetRateLimit(storeName: string, key: string): void {
  getStore(storeName).delete(key)
}
