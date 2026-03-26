# Embedding the Madhouse Wallet Offramp Widget

The widget ships as a self-contained JS library — CSS is injected automatically, no stylesheet import required. React is a peer dependency and is not bundled.

---

## 1. Build the library

```bash
npm run build:lib
```

This produces `dist-lib/`:

| File | Purpose |
| --- | --- |
| `mw-offramp-widget.es.js` | ESM bundle — for bundlers (Webpack, Vite, Next.js, etc.) |
| `mw-offramp-widget.umd.js` | UMD bundle — for `<script>` tags and CDN use |
| `proxy-server.js` | Standalone proxy server (see section 2) |
| `lib/index.d.ts` | TypeScript declarations |

The build script installs its own dev-dependencies on first run — you don't need to install anything manually.

---

## 2. Run the proxy server

The widget never holds your API credentials. Instead it calls a proxy you run server-side. The build produces `dist-lib/proxy-server.js` — a ready-to-run Express server that handles all of this for you.

### Prerequisites

```bash
npm install express
```

### Start it

```bash
node proxy-server.js <WIDGET_API_KEY> <WIDGET_USER_ID> [port]
```

| Argument | Required | Description |
| --- | --- | --- |
| `WIDGET_API_KEY` | Yes | Your Madhouse Wallet API key (`mw_live_...`). Obtain from `business.madhousewallet.com/developers`. |
| `WIDGET_USER_ID` | Yes | Your Madhouse Wallet user ID. |
| `port` | No | Port to listen on. Defaults to `3001`. |

Arguments can also be passed as environment variables:

```bash
WIDGET_API_KEY=mw_live_... WIDGET_USER_ID=123 PORT=3001 node proxy-server.js
```

### What it does

- Listens for widget requests on `/payouts/...`
- Enforces a path allowlist (SSRF protection — only the endpoints the widget needs are reachable)
- Injects `Authorization: Bearer <WIDGET_API_KEY>` on every upstream request
- Injects `user_id: <WIDGET_USER_ID>` into recipient and transfer request bodies server-side
- Forwards to `https://business.madhousewallet.com/api/payouts/...`
- Returns a `/health` endpoint for uptime checks

### Adding your own auth (optional)

The proxy accepts requests from any origin by default. In production you should restrict access to authenticated users. Add middleware before the proxy starts — for example:

```js
// After requiring express, before starting the server:
app.use((req, res, next) => {
  const token = req.headers['x-my-app-token']
  if (token !== process.env.MY_APP_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})
```

Then pass that header from the widget:

```js
configureClient({
  proxyUrl: 'http://localhost:3001',
  getHeaders: () => ({ 'x-my-app-token': myAppToken }),
})
```

---

## 3. Next.js proxy route (alternative to Express)

If your embedding app is already a Next.js project, use `dist-lib/nextjs-proxy-handler.js` instead of running the standalone Express server.

Add to your `.env.local`:

```env
WIDGET_API_KEY=mw_live_...
WIDGET_USER_ID=your-user-id
```

### Pages Router

Copy the file to `pages/api/mw-proxy/[...path].js`:

```bash
cp node_modules/mw-offramp-widget/nextjs-proxy-handler.js pages/api/mw-proxy/[...path].js
```

Configure the widget:

```js
configureClient({ proxyUrl: '/api/mw-proxy' })
```

### App Router

The same file exports named `GET`, `POST`, and `DELETE` handlers for the App Router. Copy it to `app/api/mw-proxy/[...path]/route.js`:

```bash
cp node_modules/mw-offramp-widget/nextjs-proxy-handler.js app/api/mw-proxy/[...path]/route.js
```

Configure the widget:

```js
configureClient({ proxyUrl: '/api/mw-proxy' })
```

### Adding auth (Next.js)

Open the copied handler file and add your session check directly — example with NextAuth:

```js
// Pages Router — add near the top of the default export handler:
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'

const session = await getServerSession(req, res, authOptions)
if (!session) return res.status(401).json({ error: 'Unauthorized' })
```

---

## 4. Install the widget

### Option A — local package (ESM / bundler)

```bash
npm install ./path/to/dist-lib
```

Or after publishing to npm:

```bash
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

// Call once at app startup — points the widget at your proxy
configureClient({
  proxyUrl: 'https://yourapp.com/mw-proxy',
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
    proxyUrl: 'https://yourapp.com/mw-proxy',
  })

  const unmount = mountWidget('#mw-widget', {
    onSuccess: function (transferId) {
      console.log('Transfer initiated:', transferId)
    },
  })

  // To tear down later:
  // unmount()
</script>
```

---

## 5. `configureClient` options

```ts
configureClient({
  /**
   * Required. Base URL of your proxy server.
   * The widget appends paths like /payouts/quote, /payouts/recipients, etc.
   * No trailing slash.
   */
  proxyUrl: 'https://yourapp.com/mw-proxy',

  /**
   * Optional. Returns extra headers sent on every request to the proxy.
   * Use this for any auth your proxy requires (session token, CSRF, etc.).
   * May be async.
   */
  getHeaders: async () => ({
    'x-my-app-token': await getSessionToken(),
  }),
})
```

---

## 6. `mountWidget` reference

```ts
const unmount = mountWidget(
  '#my-container',  // CSS selector or HTMLElement
  {
    onSuccess: (transferId: string) => void,
    onError:   (error: Error) => void,
  }
)

unmount()  // tears down the widget and cleans up
```

---

## 7. Sizing

The widget card is `max-w-md` (~448 px) wide and expands vertically with content:

```css
#mw-widget {
  width: 480px;
  max-width: 100%;
}
```

---

## 8. Security

- `WIDGET_API_KEY` and `WIDGET_USER_ID` live only in the proxy process — never in the browser bundle.
- The proxy enforces a strict path allowlist so only the ten endpoints the widget needs are reachable upstream.
- Add your own auth middleware to the proxy (see section 2) to prevent unauthorized use.
- reCAPTCHA, WhatsApp support, and any other integrations are your application's responsibility — the widget does not include them.
