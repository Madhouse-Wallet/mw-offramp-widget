# MW Offramp Widget

An embeddable crypto offramp widget that lets users sell USDC and receive fiat currency (EUR, GBP, PHP, and 40+ others) directly to their bank account via Wise.

Built with Next.js 15. The Madhouse Wallet API key never leaves the server.

## How it works

1. **Amount** — Enter a USD amount and choose a target currency. Live exchange rate and fee breakdown shown instantly.
2. **Recipient** — Enter bank account details. Fields are dynamic per currency (routing number, IBAN, sort code, etc.).
3. **Confirm** — Review the full order before committing.
4. **Send** — Send USDC to the displayed deposit address on Base. Payout is processed automatically.

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

| Variable | Description |
| --- | --- |
| `WIDGET_API_KEY` | Your Madhouse Wallet API key (`mw_live_...`). Get one from [business.madhousewallet.com/developers](https://business.madhousewallet.com/developers). |
| `WIDGET_JWT_SECRET` | Random 32+ char secret for internal request signing. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

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

AED, AUD, BDT, BGN, BRL, CAD, CHF, CZK, DKK, EGP, EUR, GBP, GHS, HKD, HRK, HUF, IDR, ILS, INR, JPY, KES, LKR, MAD, MXN, MYR, NGN, NOK, NPR, NZD, PHP, PKR, PLN, RON, RWF, SAR, SEK, SGD, THB, TRY, TZS, UGX, USD, VND, XOF, ZAR
