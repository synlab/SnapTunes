import type { CSSProperties } from 'react'
import {
  OVERLAY_BASE_STYLE,
  OVERLAY_DEBUG_LABEL_STYLE,
  OVERLAY_DEBUG_PANEL_STYLE,
  OVERLAY_DEBUG_ROWS_STYLE,
  OVERLAY_DEBUG_ROW_STYLE,
  OVERLAY_DEBUG_TITLE_STYLE,
  OVERLAY_DEBUG_VALUE_STYLE,
  OVERLAY_MONOSPACE_TEXT_STYLE,
} from './overlayStyles'

interface DebugOverlayProps {
  title: string
  values: Map<string, any>
  enabled?: boolean
  style?: CSSProperties
}

function formatDebugValue(value: any): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  if (value instanceof Map) {
    return JSON.stringify(Object.fromEntries(value.entries()), null, 2)
  }

  if (Array.isArray(value) || typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

export function DebugOverlay({ enabled = true, title, values, style }: DebugOverlayProps) {
  if (!enabled) {
    return null
  }

  return (
    <div
      style={{
        ...OVERLAY_BASE_STYLE,
        ...OVERLAY_DEBUG_PANEL_STYLE,
        ...OVERLAY_MONOSPACE_TEXT_STYLE,
        ...style,
      }}
    >
      <div style={OVERLAY_DEBUG_TITLE_STYLE}>{title}</div>
      {values.size > 0 && (
        <div style={OVERLAY_DEBUG_ROWS_STYLE}>
        {Array.from(values.entries()).map(([label, value]) => (
          <div key={label} style={OVERLAY_DEBUG_ROW_STYLE}>
            <span style={OVERLAY_DEBUG_LABEL_STYLE}>{label}:</span>
            <span style={OVERLAY_DEBUG_VALUE_STYLE}>{formatDebugValue(value)}</span>
          </div>
        ))}
        </div>
      )}
    </div>
  )
}