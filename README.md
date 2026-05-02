# Madhouse Wallet Crypto Offramp

An embeddable crypto offramp widget for Madhouse Wallet. Users sell USDC (on 6 networks) and receive 82 fiat currencies directly to their bank account.

Built with Next.js 15. Supports light and dark mode. API credentials never leave the server.

<img width="1706" height="1255" alt="image" src="https://github.com/user-attachments/assets/8b41e4a7-0fe0-4912-b204-b174b0e69f8b" />


## How it works

1. **Verify Email** — Enter your email address. A 6-digit one-time code is sent to you (valid for 10 minutes, max 3 resends). Enter the code to authenticate — this gates all subsequent API calls.
2. **Amount** — Enter a USD amount and choose a target currency. Live exchange rate and fee breakdown shown instantly.
3. **Recipient** — Enter bank account details. Fields are dynamic per currency (routing number, IBAN, sort code, etc.).
4. **Confirm** — Review the full order before committing.
5. **Send** — Send USDC to the displayed deposit address on your chosen network (Base, Arbitrum, Ethereum, Optimism, Polygon, or Solana). Payout is processed automatically.

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd mw-offramp-widget
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Side | Required | Description |
| --- | --- | --- | --- |
| `WIDGET_API_KEY` | Server | Yes | Your Madhouse Wallet API key (`mw_live_...`). Get one from [business.madhousewallet.com/developers](https://business.madhousewallet.com/developers). |
| `WIDGET_USER_ID` | Server | Yes | Your Madhouse Wallet user ID. Obtain from [business.madhousewallet.com/developers](https://business.madhousewallet.com/developers). |
| `WIDGET_JWT_SECRET` | Server | Yes | Min 32-char secret for signing short-lived widget JWTs. Generate: `node scripts/gen-secrets.js` |
| `WIDGET_ENCRYPT_SECRET` | Server | Yes | 32-byte hex secret for AES-256-GCM payload encryption. Generate: `node scripts/gen-secrets.js` |
| `WIDGET_API_BASE_URL` | Server | No | Override upstream API base URL. Defaults to `https://business.madhousewallet.com`. Staging/local only. |
| `RECAPTCHA_SECRET_KEY` | Server | No | reCAPTCHA v3 server-side secret key for token verification. |
| `AWS_REGION` | Server | Yes | AWS region for Amazon SES (e.g. `us-east-1`). Credentials are provided via IAM role — no static keys needed. |
| `SES_FROM_ADDRESS` | Server | Yes | Verified sender address in your AWS SES account (e.g. `noreply@yourdomain.com`). Verify at the [SES console](https://console.aws.amazon.com/ses). |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Browser | Yes | WalletConnect v2 project ID. Obtain from [cloud.walletconnect.com](https://cloud.walletconnect.com). |
| `NEXT_PUBLIC_SITE_URL` | Browser | Yes | Canonical site URL for JSON-LD and OG tags. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Browser | No | reCAPTCHA v3 site key. Badge and verification skipped when omitted. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Browser | No | Google Analytics 4 measurement ID. |
| `NEXT_PUBLIC_GTM_ID` | Browser | No | Google Tag Manager container ID (e.g. `GTM-XXXXXXX`). |
| `NEXT_PUBLIC_SUPPORT_URL` | Browser | No | Support link used by the chat button. |

### 3. Run

```bash
npm run dev      # development — http://localhost:3000
npm run build    # production build
npm run start    # serve production build
```

## Deployment

Deploy as a standard Next.js app (Vercel, AWS Amplify, etc.). Set `WIDGET_API_KEY` and `WIDGET_JWT_SECRET` as environment variables in your hosting provider — **never commit them**.

The widget is a full-page Next.js app. To embed it in another page, deploy it to its own subdomain and load it in an `<iframe>`.

## Security

- `WIDGET_API_KEY` is held server-side only and never exposed to the browser.
- All proxy requests require a short-lived JWT issued by the same Next.js server, preventing external callers from reaching the proxy.
- User inputs are sanitized (null bytes stripped, length limits, currency allowlist, UUID format validation) before any upstream API call.

## Supported currencies

AED, ALL, ARS, AUD, BAM, BDT, BGN, BHD, BMD, BOB, BRL, BWP, CAD, CHF, CLP, CNY, COP, CRC, CVE, CZK, DKK, DOP, EGP, EUR, GBP, GEL, GHS, GMD, GNF, GTQ, HKD, HNL, HUF, IDR, ILS, INR, ISK, JPY, KES, KGS, KHR, KRW, KWD, LAK, LKR, MAD, MNT, MOP, MUR, MXN, MYR, NAD, NGN, NIO, NOK, NPR, NZD, OMR, PEN, PHP, PKR, PLN, PYG, QAR, RON, RSD, RWF, SAR, SCR, SEK, SGD, SRD, THB, TND, TRY, TZS, UAH, UGX, USD, UYU, VND, ZAR
