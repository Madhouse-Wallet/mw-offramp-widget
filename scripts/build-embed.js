#!/usr/bin/env node
/**
 * build-embed.js
 *
 * Builds the Next.js app and produces two embeddable artifacts in ./dist-embed/:
 *
 *   1. iframe-snippet.html  — ready-made <iframe> snippet for copy/paste
 *   2. widget-loader.js     — tiny JS loader that injects the iframe dynamically
 *
 * Usage:
 *   node scripts/build-embed.js [--host https://your-deployed-url.com]
 *
 * The --host flag sets the URL where the widget is hosted.
 * Defaults to http://localhost:3000 for local testing.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const hostFlagIdx = args.indexOf("--host");
const HOST =
  hostFlagIdx !== -1 && args[hostFlagIdx + 1]
    ? args[hostFlagIdx + 1].replace(/\/$/, "")
    : "http://localhost:3000";

const OUT_DIR = path.resolve(__dirname, "../dist-embed");

// ---------------------------------------------------------------------------
// Build Next.js (skip if --no-build passed)
// ---------------------------------------------------------------------------
if (!args.includes("--no-build")) {
  console.log("Building Next.js app...");
  execSync("npm run build", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });
  console.log("Build complete.\n");
} else {
  console.log("Skipping Next.js build (--no-build).\n");
}

// ---------------------------------------------------------------------------
// Create output directory
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1. iframe-snippet.html
// ---------------------------------------------------------------------------
const iframeSnippet = `<!-- Madhouse Wallet Offramp Widget -->
<!-- Place this snippet wherever you want the widget to appear. -->
<!-- Adjust width/height to suit your layout. -->
<iframe
  src="${HOST}"
  id="mw-offramp-widget"
  title="Madhouse Wallet Offramp"
  width="480"
  height="720"
  style="border:none;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);"
  allow="clipboard-write"
  loading="lazy"
></iframe>
`;

fs.writeFileSync(path.join(OUT_DIR, "iframe-snippet.html"), iframeSnippet);
console.log("✓ dist-embed/iframe-snippet.html");

// ---------------------------------------------------------------------------
// 2. widget-loader.js  (self-contained, no dependencies)
// ---------------------------------------------------------------------------
const loaderScript = `/**
 * Madhouse Wallet Offramp Widget — dynamic loader
 * Version: ${require("../package.json").version}
 * Host: ${HOST}
 *
 * Usage:
 *   <div id="mw-offramp-root"></div>
 *   <script src="widget-loader.js"></script>
 *
 * Options (set on window before loading the script, or pass as data-* attributes
 * on the container div):
 *
 *   window.MWOfframpConfig = {
 *     host:        "${HOST}",      // where the widget app is hosted
 *     containerId: "mw-offramp-root",  // id of the mount element
 *     width:       "480px",
 *     height:      "720px",
 *     borderRadius: "12px",
 *   };
 */
(function () {
  "use strict";

  var cfg = window.MWOfframpConfig || {};
  var host = cfg.host || "${HOST}";
  var containerId = cfg.containerId || "mw-offramp-root";
  var width = cfg.width || "480px";
  var height = cfg.height || "720px";
  var borderRadius = cfg.borderRadius || "12px";

  function mount() {
    var container = document.getElementById(containerId);
    if (!container) {
      console.warn("[MWOfframp] Container #" + containerId + " not found.");
      return;
    }

    var iframe = document.createElement("iframe");
    iframe.src = host;
    iframe.id = "mw-offramp-frame";
    iframe.title = "Madhouse Wallet Offramp";
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("loading", "lazy");
    iframe.style.cssText =
      "border:none;width:" + width + ";height:" + height +
      ";border-radius:" + borderRadius +
      ";box-shadow:0 4px 24px rgba(0,0,0,0.12);display:block;";

    container.appendChild(iframe);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
`;

fs.writeFileSync(path.join(OUT_DIR, "widget-loader.js"), loaderScript);
console.log("✓ dist-embed/widget-loader.js");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`
Done. Artifacts written to dist-embed/

  iframe-snippet.html  — paste directly into any HTML page
  widget-loader.js     — include via <script> tag; mounts into a div

Widget will be served from: ${HOST}
`);
