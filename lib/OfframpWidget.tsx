/**
 * lib/OfframpWidget.tsx
 *
 * Thin wrapper around the existing OfframpWidget component.
 * Wraps it in an isolated container so injected Tailwind styles are scoped.
 */
import React from 'react'
import { OfframpWidget as CoreWidget } from '../src/components/OfframpWidget'
import type { WidgetProps } from './types'

export function OfframpWidget(props: WidgetProps) {
  return (
    <div className="mw-offramp-widget">
      <CoreWidget {...props} />
    </div>
  )
}
