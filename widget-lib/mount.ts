/**
 * lib/mount.ts
 *
 * Vanilla JS mount function for non-React consumers.
 *
 * Usage:
 *   import { configureClient, mountWidget } from 'mw-offramp-widget'
 *
 *   configureClient({ proxyUrl: 'https://yourapp.com/api/mw-proxy' })
 *
 *   const unmount = mountWidget('#my-widget-container', {
 *     onSuccess: (transferId) => console.log('Done!', transferId),
 *   })
 *
 *   // Later, to tear down:
 *   unmount()
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { OfframpWidget } from './OfframpWidget'
import type { WidgetProps } from './types'

/**
 * Mount the widget into a DOM element.
 *
 * @param container  CSS selector string or HTMLElement
 * @param props      Optional WidgetProps (onSuccess, onError)
 * @returns          A function that unmounts the widget and cleans up
 */
export function mountWidget(
  container: string | HTMLElement,
  props: WidgetProps = {},
): () => void {
  const el =
    typeof container === 'string'
      ? document.querySelector<HTMLElement>(container)
      : container

  if (!el) {
    throw new Error(
      `[mw-offramp] mountWidget: could not find container "${container}"`,
    )
  }

  const root = createRoot(el)
  root.render(React.createElement(OfframpWidget, props))

  return () => {
    root.unmount()
  }
}
