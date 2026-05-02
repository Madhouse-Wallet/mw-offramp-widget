# mw-offramp-widget

A standalone Next.js 15 crypto offramp widget for Madhouse Wallet. Users verify their email via OTP, enter a USD amount, choose a target currency, provide recipient bank details, confirm, and receive a USDC deposit address to send funds to. The payout is then processed via the Madhouse Wallet.

## Stack

| Technology | Version | Purpose |
| --- | --- | --- |
| Next.js | 15 (Pages Router) | Framework + server-side API proxy |
| React | 18 | UI |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 3 | Styling (light + dark mode; `darkMode: 'class'`) |
| `jose` | 5 | HS256 JWT signing/verification |

## Architecture

### Request flow

```text
Browser (React widget)
  │
  │  POST /api/auth/send-otp   (email → 6-digit OTP via Amazon SES)
  │  ← { otpToken, expiresIn: 600 }
  │
  │  POST /api/auth/verify-otp  (otpToken + code → session JWT)
  │  ← { sessionToken, expiresIn: 7200 }
  │
  │  GET/POST /api/proxy/...  Authorization: Bearer <session-jwt>
  │
  ▼
Next.js proxy  (src/pages/api/proxy/[...path].ts)
  │  verifies session JWT (WIDGET_JWT_SECRET, aud "mw-widget-proxy")
  │  restricts to allowlisted paths
  │
  │  Authorization: Bearer mw_live_...  (WIDGET_API_KEY)
  ▼
business.madhousewallet.com  (Madhouse Wallet business API)
```

**Why the proxy?** `WIDGET_API_KEY` is a permanent Madhouse Wallet API key that must never reach the browser. The Next.js proxy holds it server-side. The session JWT (issued after email OTP verification) ensures only verified users can call the proxy — external callers without a valid JWT are rejected with 401.

### 5-step wizard flow

```text
Verify Email → Amount → Recipient → Confirm → Send
```

State accumulates in `Partial<OrderState>` (see `src/types.ts`) and is passed forward via `onNext(data)` callbacks in `OfframpWidget.tsx`. The `verify-email` step is never persisted to `sessionStorage` — the widget always restarts at the email gate.

| Step | Component | What happens |
| --- | --- | --- |
| 0 | `EmailVerifyScreen` + `OtpModal` | User enters email address. A 6-digit OTP is sent via Amazon SES (valid 10 min, max 3 resends). The `OtpModal` (rendered via React portal) accepts the code. On success, `OfframpWidget` calls `setSessionToken()` and advances to step 1. |
| 1 | `AmountStep` | User enters USD amount + target currency. Debounced quote fetch from `/api/proxy/payouts/quote`. Shows exchange rate, fees, estimated receive amount. |
| 2 | `RecipientStep` | Fetches dynamic account requirements from `/api/proxy/payouts/account-requirements`. Renders fields (text/select/radio) per currency. Supports `refreshRequirementsOnChange` fields. Creates recipient via `POST /api/proxy/payouts/recipients`. |
| 3 | `ConfirmStep` | Shows full order summary. On confirm, calls `POST /api/proxy/payouts/transfer`. Recipient is deleted on session expiry (401) or on Back. |
| 4 | `SendStep` | Displays USDC deposit address (chosen network) with copy buttons. User sends USDC; payout is processed automatically. |

### Recipient lifecycle

Recipient is created at the end of step 2 and deleted automatically on:

- Back button from step 3 (`ConfirmStep`)
- 401 session expired at any point (`onSessionExpired` → `deleteRecipient`)
- Transfer successfully initiated (step 4 reached — recipient served its purpose)

---

## Environment variables

| Variable | Side | Required | Purpose |
| --- | --- | --- | --- |
| `WIDGET_API_KEY` | Server only | Yes | Madhouse Wallet API key (`mw_live_...`). Forwarded as `Authorization: Bearer` to the upstream API. Obtain from `business.madhousewallet.com/developers`. |
| `WIDGET_USER_ID` | Server only | Yes | Your Madhouse Wallet user ID. Injected into recipient and transfer request bodies. Obtain from `business.madhousewallet.com/developers`. |
| `WIDGET_JWT_SECRET` | Server only | Yes | Min 32-char secret for signing short-lived widget JWTs. Prevents external callers from using the proxy. Generate: `node scripts/gen-secrets.js` |
| `WIDGET_ENCRYPT_SECRET` | Server only | Yes | 32-byte hex secret for AES-256-GCM payload encryption between browser and proxy. Generate: `node scripts/gen-secrets.js` |
| `WIDGET_API_BASE_URL` | Server only | No | Override upstream API base URL. Defaults to `https://business.madhousewallet.com`. Only needed for staging/local. |
| `RECAPTCHA_SECRET_KEY` | Server only | No | reCAPTCHA v3 server-side secret key for token verification. |
| `AWS_REGION` | Server only | Yes | AWS region for Amazon SES (e.g. `us-east-1`). Credentials are provided via the Amplify IAM role — no static keys needed. |
| `SES_FROM_ADDRESS` | Server only | Yes | Verified sender address in your AWS SES account (e.g. `noreply@yourdomain.com`). Verify at `console.aws.amazon.com/ses`. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Browser | Yes | WalletConnect v2 project ID. Obtain from `cloud.walletconnect.com`. Required for the WalletConnect modal. |
| `NEXT_PUBLIC_SITE_URL` | Browser | Yes | Canonical site URL used for JSON-LD, OG tags, and the sitemap. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Browser | No | reCAPTCHA v3 site key. Badge and captcha verification are skipped when omitted. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Browser | No | Google Analytics 4 measurement ID. Analytics skipped when omitted. |
| `NEXT_PUBLIC_GTM_ID` | Browser | No | Google Tag Manager container ID (e.g. `GTM-XXXXXXX`). GTM tags not fired when omitted. |
| `NEXT_PUBLIC_SUPPORT_URL` | Browser | No | Support link used by the chat button. |

**Server-only vars must never be prefixed with `NEXT_PUBLIC_`** — they must stay server-side.

---

## Project structure

```text
src/
├── api/
│   └── client.ts                  # All browser→proxy calls; JWT token cache; input sanitization
├── components/
│   ├── OfframpWidget.tsx           # Root wizard; owns OrderState; handles step transitions
│   ├── WalletButton.tsx            # EVM (WalletConnect, Coinbase) + Solana wallet connect button
│   ├── steps/
│   │   ├── AmountStep.tsx          # Step 1: USD amount + currency selector + quote
│   │   ├── ConfirmStep.tsx         # Step 3: order review + transfer initiation
│   │   ├── EmailVerifyScreen.tsx   # Step 0: email input + OTP send trigger
│   │   ├── RecipientStep.tsx       # Step 2: dynamic bank account form + recipient creation
│   │   └── SendStep.tsx            # Step 4: deposit address display
│   └── ui/
│       ├── Button.tsx              # Primary/secondary/danger variants; loading state
│       ├── CurrencySelect.tsx      # Searchable currency dropdown
│       ├── Input.tsx               # Labeled text input with error display
│       ├── OtpModal.tsx            # Full-screen OTP entry modal (React portal)
│       ├── Select.tsx              # Labeled dropdown with error display
│       ├── Spinner.tsx             # SVG loading spinner
│       └── StepIndicator.tsx       # 5-step progress dots
├── lib/
│   ├── payload-crypto.ts          # AES-256-GCM encrypt/decrypt helpers
│   └── rate-limit.ts              # In-memory sliding-window rate limiter
├── pages/
│   ├── _app.tsx                    # Next.js app entry; imports globals.css
│   ├── _document.tsx               # Custom Document; viewport meta tag + GTM noscript
│   ├── index.tsx                   # Home page; navbar, hero, country ticker, widget
│   └── api/
│       ├── og.tsx                  # Open Graph image generation
│       ├── sitemap.xml.ts          # Dynamic XML sitemap
│       ├── auth/
│   │   ├── send-otp.ts         # POST — validates email, sends 6-digit OTP via Amazon SES, returns signed otpToken JWT
│       │   ├── verify-captcha.ts   # POST — reCAPTCHA v3 server-side token verification
│       │   ├── verify-otp.ts       # POST — verifies OTP + captcha, issues 2-hour session JWT
│       │   └── widget-key.ts       # GET — vends AES-256-GCM key as base64url
│       └── proxy/
│           └── [...path].ts        # Authenticated reverse proxy to upstream API
├── styles/
│   └── globals.css                 # Tailwind base + custom font/scrollbar/autofill styles
└── types.ts                        # OrderState, WidgetProps, API response types
```

---

## API routes

### `GET /api/auth/widget-key`

No authentication required (same-origin). Derives the 32-byte AES-256-GCM key from `WIDGET_ENCRYPT_SECRET` and returns it as `{ key: "<base64url>" }`. The browser caches this key and uses it to encrypt outgoing request payloads and decrypt encrypted responses from the proxy.

### `POST /api/auth/send-otp`

No authentication required. Validates the email address, runs optional reCAPTCHA v3 verification, generates a 6-digit OTP, emails it via Amazon SES, and returns `{ otpToken, expiresIn: 600 }`. The `otpToken` is a short-lived HS256 JWT containing the hashed email and hashed OTP.

Rate limits (per email, in-memory — resets on server restart):
- Max 3 sends in any 5-minute window
- 4th attempt within the window: 30-minute cooldown imposed (HTTP 429 with `retryAfter`)

### `POST /api/auth/verify-otp`

No authentication required. Verifies the `otpToken` JWT, the 6-digit `code`, and an optional reCAPTCHA token. On success, issues a **2-hour** HS256 session JWT with audience `"mw-widget-proxy"` and returns `{ sessionToken, expiresIn: 7200 }`. The client stores this via `setSessionToken()` and uses it for all subsequent proxy calls — no call to `widget-token.ts` is needed.

### `GET|POST|DELETE /api/proxy/[...path]`

Allowed paths:

- `payouts/quote`
- `payouts/transfer` (and `payouts/transfer/cancel`)
- `payouts/recipients` (and `payouts/recipients/:id`)
- `payouts/account-requirements`
- `payouts/deposit-options`
- `payouts/fee`
- `payouts/amount-limits`

Requires `Authorization: Bearer <widget-jwt>`. Verifies the JWT before forwarding. Strips the `path` query param, preserves all other query params, and forwards the request body unchanged. Attaches `Authorization: Bearer <WIDGET_API_KEY>` to the upstream request.

---

## `src/api/client.ts` — security measures

| Measure | Detail |
| --- | --- |
| Currency allowlist | 82 currencies validated before any API call |
| Amount bounds | Must be finite, > 0, ≤ 1,000,000 |
| String sanitization | Null bytes stripped, max lengths enforced on all string inputs |
| Recipient ID validation | Must be a positive integer ≤ 2,147,483,647 before URL interpolation |
| UUID validation | `quote_id` and `customer_uuid` checked against `/^[0-9a-f-]{32,36}$/i` |
| ReDoS protection | Server-supplied `validationRegexp` evaluated inside try/catch; input capped at 200 chars |
| OTP email gate | All proxy access requires a 2-hour session JWT issued by `/api/auth/verify-otp` after email OTP verification |
| JWT session cache | `setSessionToken()` stores the session JWT in memory; `getWidgetToken()` throws 401 immediately if no valid session exists — no auto-fetch |

---

## Styling

- Light **and** dark modes — `darkMode: 'class'`; the `dark` class is toggled on `<html>` via `localStorage` key `mw-theme` (falls back to `prefers-color-scheme`)
- Brand palette:
  - `#ef5200` — primary CTA buttons
  - `#fa4536` — hover states and focus rings
  - `#fd754d` — secondary actions and support button
  - `#fe8714` — accents, required-field asterisks, badge dots
- Skeuomorphic dark-mode toggle switch (sun/moon) in the navbar
- Logo: `public/mw.png`
- Page hero: "Turn your crypto into cash" with trust badges and country ticker

---

## Maintenance rules

- **Every code change must be reflected in both `src/` and `widget-lib/`.** These two builds must stay in sync — `src/` is the Next.js standalone app, `widget-lib/` is the embeddable library. Any addition, removal, or modification to API functions, types, proxy allowlist paths, or UI behaviour must be applied to both. `widget-lib/types.ts` re-exports from `src/types` (single source of truth for types), but `widget-lib/api/client.ts` is a separate file and must be updated independently.

- **Whenever you add or remove an environment variable**, you must update all three of:
  1. `.env.example` — add/remove the entry with a comment
  2. `amplify.yml` — add/remove the corresponding `env | grep -e VAR_NAME >> .env.production || true` line
  3. The env vars table in this file (below)

---

## Build & development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # ESLint
```

Build must exit 0 before any task is considered complete.

---

## Security notes

- `WIDGET_API_KEY` never reaches the browser under any circumstances.
- All proxy access is gated by email OTP verification — users must prove ownership of a valid email address before any upstream API call is made. The resulting session JWT is valid for 2 hours.
- CORS on the proxy is `*` — intentional for embeddable use. Restrict if deploying in a controlled environment.
- The proxy path allowlist is the hard gate against SSRF — only the approved upstream paths can be reached.
