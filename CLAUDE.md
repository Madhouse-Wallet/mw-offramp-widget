# mw-offramp-widget

A standalone Next.js 15 crypto offramp widget for Madhouse Wallet. Users enter a USD amount, choose a target currency, provide recipient bank details, confirm, and receive a USDC deposit address to send funds to. The payout is then processed via the Madhouse Wallet / Wise pipeline.

## Stack

| Technology | Version | Purpose |
| --- | --- | --- |
| Next.js | 15 (Pages Router) | Framework + server-side API proxy |
| React | 18 | UI |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 3 | Styling (light mode only — no dark mode) |
| `jose` | 5 | HS256 JWT signing/verification |

## Architecture

### Request flow

```text
Browser (React widget)
  │
  │  POST /api/auth/widget-token  (same-origin, no auth)
  │  ← { token, expiresIn }
  │
  │  GET/POST /api/proxy/...  Authorization: Bearer <widget-jwt>
  │
  ▼
Next.js proxy  (src/pages/api/proxy/[...path].ts)
  │  verifies widget JWT (WIDGET_JWT_SECRET)
  │  restricts to allowlisted paths
  │
  │  Authorization: Bearer mw_live_...  (WIDGET_API_KEY)
  ▼
business.madhousewallet.com  (Madhouse Wallet business API)
```

**Why the proxy?** `WIDGET_API_KEY` is a permanent Madhouse Wallet API key that must never reach the browser. The Next.js proxy holds it server-side. The widget JWT ensures only requests originating from the widget's own frontend can call the proxy — external callers without a valid JWT are rejected with 401.

### 4-step wizard flow

```text
Amount → Recipient → Confirm → Send
```

State accumulates in `Partial<OrderState>` (see `src/types.ts`) and is passed forward via `onNext(data)` callbacks in `OfframpWidget.tsx`.

| Step | Component | What happens |
| --- | --- | --- |
| 1 | `AmountStep` | User enters USD amount + target currency. Debounced quote fetch from `/api/proxy/payouts/quote`. Shows exchange rate, fees, estimated receive amount. |
| 2 | `RecipientStep` | Fetches dynamic account requirements from `/api/proxy/payouts/account-requirements`. Renders fields (text/select/radio) per currency. Supports `refreshRequirementsOnChange` fields. Creates recipient via `POST /api/proxy/payouts/recipients`. |
| 3 | `ConfirmStep` | Shows full order summary. On confirm, calls `POST /api/proxy/payouts/transfer`. Recipient is deleted on session expiry (401) or on Back. |
| 4 | `SendStep` | Displays USDC deposit address (Base network) with copy buttons. User sends USDC; payout is processed automatically. |

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
| `WIDGET_JWT_SECRET` | Server only | Yes | Min 32-char secret for signing short-lived widget JWTs. Prevents external callers from using the proxy. Generate: `node scripts/gen-secrets.js` |
| `WIDGET_ENCRYPT_SECRET` | Server only | Yes | 32-byte hex secret for AES-256-GCM payload encryption between browser and proxy. Generate: `node scripts/gen-secrets.js` |
| `WIDGET_API_BASE_URL` | Server only | No | Override upstream API base URL. Defaults to `https://business.madhousewallet.com`. Only needed for staging/local. |

**Never prefix these with `NEXT_PUBLIC_`** — they must stay server-side.

---

## Project structure

```text
src/
├── api/
│   └── client.ts                  # All browser→proxy calls; JWT token cache; input sanitization
├── components/
│   ├── OfframpWidget.tsx           # Root wizard; owns OrderState; handles step transitions
│   ├── steps/
│   │   ├── AmountStep.tsx          # Step 1: USD amount + currency selector + quote
│   │   ├── RecipientStep.tsx       # Step 2: dynamic bank account form + recipient creation
│   │   ├── ConfirmStep.tsx         # Step 3: order review + transfer initiation
│   │   └── SendStep.tsx            # Step 4: deposit address display
│   └── ui/
│       ├── Button.tsx              # Primary/secondary/danger variants; loading state
│       ├── Input.tsx               # Labeled text input with error display
│       ├── Select.tsx              # Labeled dropdown with error display
│       ├── Spinner.tsx             # SVG loading spinner
│       └── StepIndicator.tsx       # 4-step progress dots
├── pages/
│   ├── _app.tsx                    # Next.js app entry; imports globals.css
│   ├── index.tsx                   # Home page; renders OfframpWidget centered on gray bg
│   └── api/
│       ├── auth/
│       │   └── widget-token.ts     # POST — issues 1-hour HS256 widget JWT
│       └── proxy/
│           └── [...path].ts        # Authenticated reverse proxy to upstream API
├── styles/
│   └── globals.css                 # Tailwind base + custom font/scrollbar/autofill styles
└── types.ts                        # OrderState, WidgetProps, API response types
```

---

## API routes

### `POST /api/auth/widget-token`

No authentication required (same-origin call from the page). Issues a 1-hour HS256 JWT signed with `WIDGET_JWT_SECRET`, audience `"mw-widget-proxy"`. Returns `{ token, expiresIn }`.

The client caches this token in memory and refreshes it 60 seconds before expiry.

### `GET|POST|DELETE /api/proxy/[...path]`

Allowed paths:

- `payouts/quote`
- `payouts/transfer`
- `payouts/recipients` (and `payouts/recipients/:id`)
- `payouts/account-requirements`

Requires `Authorization: Bearer <widget-jwt>`. Verifies the JWT before forwarding. Strips the `path` query param, preserves all other query params, and forwards the request body unchanged. Attaches `Authorization: Bearer <WIDGET_API_KEY>` to the upstream request.

---

## `src/api/client.ts` — security measures

| Measure | Detail |
| --- | --- |
| Currency allowlist | 45 currencies validated before any API call |
| Amount bounds | Must be finite, > 0, ≤ 1,000,000 |
| String sanitization | Null bytes stripped, max lengths enforced on all string inputs |
| Recipient ID validation | Must be a positive integer ≤ 2,147,483,647 before URL interpolation |
| UUID validation | `quote_id` and `customer_uuid` checked against `/^[0-9a-f-]{32,36}$/i` |
| ReDoS protection | Server-supplied `validationRegexp` evaluated inside try/catch; input capped at 200 chars |
| JWT auto-refresh | Token refreshed 60s before expiry; cached in memory for its lifetime |

---

## Styling

- Light mode only — no `dark:` Tailwind classes anywhere
- Brand color: `orange-600` (primary buttons, accents)
- Font stack matches `stripe-direct-debit` main app
- Logo: `public/mw.png`
- Page title: "Sell Coins Now" centered above the widget card

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
- `/api/auth/widget-token` issues tokens to any same-origin request. If deployed on a public domain this is acceptable — attackers can obtain a token but can only use it to call the four allowlisted proxy paths.
- CORS on the proxy is `*` — intentional for embeddable use. Restrict if deploying in a controlled environment.
- The proxy path allowlist is the hard gate against SSRF — only the four approved upstream paths can be reached.
