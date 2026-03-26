/**
 * mw-offramp-widget — embeddable library entry point
 *
 * Exports:
 *   OfframpWidget     — React component (ESM consumers / React apps)
 *   mountWidget       — Vanilla JS mount (non-React consumers, script-tag use)
 *   configureClient   — Must be called before mounting; sets the proxy URL
 *   ClientConfig      — TypeScript type for configureClient options
 */

export { OfframpWidget } from './OfframpWidget'
export { mountWidget } from './mount'
export { configureClient } from './api/client'
export type { ClientConfig } from './api/client'
export type { WidgetProps } from './types'

// Import widget styles — vite-plugin-css-injected-by-js will bundle this into
// the JS output so consumers don't need a separate CSS import.
import './styles.css'
