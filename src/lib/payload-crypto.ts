/**
 * AES-256-GCM payload encryption for the browser↔proxy channel.
 *
 * Server side: uses WIDGET_ENCRYPT_SECRET (hex env var) via getEncryptKey().
 * Browser side: fetches the key material from /api/auth/widget-token response
 *   is NOT used here — instead the browser calls encryptPayload / decryptPayload
 *   with the raw key bytes vended by the server via a dedicated key endpoint.
 *
 * Both sides use the same jose CompactEncrypt / compactDecrypt with:
 *   alg : "dir"          (direct key agreement — no key wrapping overhead)
 *   enc : "A256GCM"      (AES-256-GCM content encryption)
 */

import { CompactEncrypt, compactDecrypt } from 'jose'

// ─── Key helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a 64-char hex string to a 32-byte Uint8Array suitable for A256GCM.
 */
export function hexToKey(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('WIDGET_ENCRYPT_SECRET must be a 64-character hex string (32 bytes)')
  }
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// ─── Encrypt ─────────────────────────────────────────────────────────────────

/**
 * Encrypt a JSON-serialisable value into a compact JWE string.
 */
export async function encryptPayload(data: unknown, key: Uint8Array): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  return new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(key)
}

// ─── Decrypt ─────────────────────────────────────────────────────────────────

/**
 * Decrypt a compact JWE string back to a parsed JSON value.
 */
export async function decryptPayload<T = unknown>(jwe: string, key: Uint8Array): Promise<T> {
  const { plaintext } = await compactDecrypt(jwe, key, {
    keyManagementAlgorithms: ['dir'],
    contentEncryptionAlgorithms: ['A256GCM'],
  })
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}
