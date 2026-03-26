# Embedding the Madhouse Wallet Offramp Widget

The widget ships as a self-contained JS library — CSS is injected automatically, no stylesheet import required. React is a peer dependency and is not bundled.

---

## 1. Build the library

```bash
npm run build:lib
```

This produces `dist-lib/`:

| File | Use |
|---|---|
| `mw-offramp-widget.es.js` | ESM — for bundlers (Webpack, Vite, Next.js, etc.) |
| `mw-offramp-widget.umd.js` | UMD — for `<script>` tags and CDN use |
| `lib/index.d.ts` | TypeScript declarations |

The build script installs its own Vite dev-dependencies on first run — you don't need to install anything manually.

---

## 2. Your backend proxy

The widget calls your backend to reach the Madhouse Wallet API. You must host a proxy that:

- Holds `WIDGET_API_KEY` and `WIDGET_USER_ID` server-side (never expose these to the browser)
- Forwards requests to `https://business.madhousewallet.com/api/payouts/...`
- Injects `Authorization: Bearer <WIDGET_API_KEY>` and `user_id: <WIDGET_USER_ID>` on the upstream request

You can copy the existing Next.js proxy from this repo (`src/pages/api/proxy/[...path].ts`) as a starting point — strip the JWT verification and JWE encryption if you use your own auth scheme, or keep them if you want the same security model.

### Required proxy endpoints

The widget calls these paths relative to `proxyUrl`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/payouts/quote` | Fetch exchange rate + fee quote |
| GET | `/payouts/deposit-options` | Fetch supported token/network pairs |
| GET | `/payouts/fee` | Fetch fee schedule |
| GET | `/payouts/account-requirements` | Fetch dynamic bank account fields |
| POST | `/payouts/account-requirements` | Refresh fields on change |
| POST | `/payouts/recipients` | Create recipient |
| DELETE | `/payouts/recipients/:id` | Delete recipient |
| POST | `/payouts/transfer` | Initiate transfer |
| GET | `/payouts/transfer/:id` | Check transfer status |
| POST | `/payouts/transfer/cancel` | Cancel pending transfer |

---

## 3. Installation

### Option A — npm package (ESM / bundler)

Copy `dist-lib/` into your project or publish it to npm, then:

```bash
npm install ./path/to/dist-lib
# or after publishing:
npm install mw-offramp-widget
```

### Option B — script tag (UMD)

Host `dist-lib/mw-offramp-widget.umd.js` on your CDN or static server. React and ReactDOM must be loaded first:

```html
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="/assets/mw-offramp-widget.umd.js"></script>
```

---

## 4. Usage

### React app (ESM)

```tsx
import { configureClient, OfframpWidget } from 'mw-offramp-widget'

// Call once before rendering — points the widget at your proxy
configureClient({
  proxyUrl: 'https://yourapp.com/api/mw-proxy',

  // Optional: attach auth headers your proxy requires
  getHeaders: async () => ({
    Authorization: `Bearer ${await getSessionToken()}`,
  }),
})

export function CheckoutPage() {
  return (
    <OfframpWidget
      onSuccess={(transferId) => {
        console.log('Transfer initiated:', transferId)
      }}
    />
  )
}
```

### Vanilla JS / script tag (UMD)

```html
<div id="mw-widget"></div>

<script>
  const { configureClient, mountWidget } = window.MWOfframpWidget

  configureClient({
    proxyUrl: 'https://yourapp.com/api/mw-proxy',
  })

  const unmount = mountWidget('#mw-widget', {
    onSuccess: function(transferId) {
      console.log('Transfer initiated:', transferId)
    },
  })

  // To tear down the widget later:
  // unmount()
</script>
```

---

## 5. `configureClient` options

```ts
configureClient({
  /**
   * Required. Base URL of your backend proxy.
   * The widget appends paths like /payouts/quote, /payouts/recipients, etc.
   * Do not include a trailing slash.
   */
  proxyUrl: 'https://yourapp.com/api/mw-proxy',

  /**
   * Optional. Returns headers merged into every API request.
   * Use this to attach session tokens, CSRF tokens, or any auth your
   * proxy requires. May be async.
   */
  getHeaders: async () => ({
    Authorization: `Bearer ${sessionToken}`,
    'X-CSRF-Token': csrfToken,
  }),
})
```

---

## 6. `mountWidget` options

```ts
const unmount = mountWidget(
  '#my-container',   // CSS selector or HTMLElement
  {
    onSuccess: (transferId: string) => void,  // transfer initiated
    onError:   (error: Error) => void,        // widget-level error
  }
)

// Unmount and clean up when done
unmount()
```

---

## 7. Sizing

The widget card is `max-w-md` (~448 px) wide and expands vertically with content. Give the container enough width and let it size naturally in height, or constrain it with `overflow: auto`:

```css
#mw-widget {
  width: 480px;
  max-width: 100%;
}
```

---

## 8. Security

- `WIDGET_API_KEY` and `WIDGET_USER_ID` must only exist on your backend proxy — never in the browser bundle.
- The widget sends plain JSON to your proxy. Your proxy is responsible for authenticating the request, injecting the API key, and forwarding to Madhouse Wallet.
- reCAPTCHA, WhatsApp support links, and any other front-end integrations are handled entirely by your application — the widget does not include them.
