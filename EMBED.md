# Embedding the Madhouse Wallet Offramp Widget

The widget is a Next.js application with server-side API routes — it cannot be bundled as a plain JS library. The correct way to embed it is via an **iframe** pointing at a deployed (or self-hosted) instance of this app.

---

## 1. Deploy the widget app

Before embedding you need a running instance of this app. Any Node.js host works.

### Environment variables required on the host

| Variable | Purpose |
|---|---|
| `WIDGET_API_KEY` | Madhouse Wallet API key (`mw_live_...`) |
| `WIDGET_JWT_SECRET` | Min 32-char secret — generate with `node scripts/gen-secrets.js` |
| `WIDGET_ENCRYPT_SECRET` | 32-byte hex secret — generate with `node scripts/gen-secrets.js` |

```bash
node scripts/gen-secrets.js   # prints both secrets
```

---

## 2. Build the embed artifacts

```bash
# Build the Next.js app AND produce dist-embed/ artifacts
node scripts/build-embed.js --host https://widget.yourapp.com

# Skip the Next.js build if you've already built
node scripts/build-embed.js --host https://widget.yourapp.com --no-build
```

This writes two files to `dist-embed/`:

| File | Use |
|---|---|
| `iframe-snippet.html` | Static HTML snippet — paste directly into any page |
| `widget-loader.js` | JS loader — mounts the iframe dynamically into a `<div>` |

---

## 3a. Static iframe snippet

Copy `dist-embed/iframe-snippet.html` and paste it wherever you want the widget:

```html
<!-- Madhouse Wallet Offramp Widget -->
<iframe
  src="https://widget.yourapp.com"
  id="mw-offramp-widget"
  title="Madhouse Wallet Offramp"
  width="480"
  height="720"
  style="border:none;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);"
  allow="clipboard-write"
  loading="lazy"
></iframe>
```

No JavaScript required. Events (success/error) are not surfaced in this mode.

---

## 3b. JS loader (recommended)

Copy `dist-embed/widget-loader.js` to your static assets and include it on any page.

### Minimal setup

```html
<div id="mw-offramp-root"></div>
<script src="/assets/widget-loader.js"></script>
```

The loader auto-mounts into `#mw-offramp-root` using the host URL baked in at build time.

### With config options

Set `window.MWOfframpConfig` **before** the script tag:

```html
<div id="mw-offramp-root"></div>

<script>
  window.MWOfframpConfig = {
    host: "https://widget.yourapp.com",  // override baked-in host if needed
    containerId: "mw-offramp-root",
    width: "480px",
    height: "720px",
    borderRadius: "12px",

    // Called when the user successfully initiates a transfer
    onSuccess: function(transferId) {
      console.log("Transfer initiated:", transferId);
      // e.g. redirect, show confirmation UI, analytics event, etc.
    },

    // Called if the widget emits an error event
    onError: function(errorMessage) {
      console.error("Widget error:", errorMessage);
    },
  };
</script>
<script src="/assets/widget-loader.js"></script>
```

### How events work

The widget uses `window.postMessage` to communicate with the parent page. The loader listens for these messages and calls your `onSuccess` / `onError` callbacks:

| `event.data.type` | Payload | Meaning |
|---|---|---|
| `mw:success` | `{ transferId: string }` | Transfer successfully initiated |
| `mw:error` | `{ message: string }` | Widget encountered an error |

You can also listen directly without the loader:

```js
window.addEventListener("message", function(event) {
  if (event.origin !== "https://widget.yourapp.com") return;
  if (event.data.type === "mw:success") {
    console.log("Transfer ID:", event.data.transferId);
  }
});
```

---

## 4. Sizing

The widget card is `max-w-md` (~448 px) wide. Recommended iframe sizes:

| Layout | Width | Height |
|---|---|---|
| Desktop sidebar / modal | `480px` | `720px` |
| Mobile full-screen | `100%` | `100vh` |
| Embedded in a card | `100%` | `700px` |

The widget is responsive and will compress to fit narrower containers.

---

## 5. Clipboard support

The Send step has a "Copy address" button. For it to work in an embedded iframe, include `allow="clipboard-write"` on the `<iframe>` element (already included in the generated snippets).

---

## 6. Security notes

- The `WIDGET_API_KEY` never leaves the server — it is proxied server-side.
- The iframe's origin is separate from your app; cookies and localStorage are not shared.
- The `postMessage` listener in the loader validates `event.origin` against the configured host. Always set `host` to the exact origin (scheme + domain + port) of your widget deployment.
- CORS on the proxy is `*` by default (intentional for embeddable use). If your widget is deployed in a controlled environment you can restrict this in `src/pages/api/proxy/[...path].ts`.
