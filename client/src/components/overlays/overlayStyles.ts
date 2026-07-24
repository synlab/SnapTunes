import type { CSSProperties } from 'react'

export const OVERLAY_BASE_STYLE: CSSProperties = {
  position: 'absolute',
  padding: '6px 8px',
  color: '#ffffff',
  fontSize: '11px',
  borderRadius: '4px',
  zIndex: 10,
  pointerEvents: 'none',
}

export const OVERLAY_MONOSPACE_TEXT_STYLE: CSSProperties = {
  lineHeight: 1.25,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace',
}

export const OVERLAY_DARK_BG = 'rgba(0, 0, 0, 0.7)'

export const OVERLAY_DEBUG_PANEL_STYLE: CSSProperties = {
  minWidth: '180px',
  maxWidth: '360px',
  borderRadius: '8px',
  backgroundColor: 'rgba(12, 16, 24, 0.86)',
  border: '1px solid rgba(255, 255, 255, 0.12)'
}

export const OVERLAY_DEBUG_TITLE_STYLE: CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.02em',
}

export const OVERLAY_DEBUG_ROWS_STYLE: CSSProperties = {
  display: 'grid',
  gap: '4px',
  marginTop: '8px',
}

export const OVERLAY_DEBUG_ROW_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '8px',
  alignItems: 'start',
}

export const OVERLAY_DEBUG_LABEL_STYLE: CSSProperties = {
  opacity: 0.76,
}

export const OVERLAY_DEBUG_VALUE_STYLE: CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}