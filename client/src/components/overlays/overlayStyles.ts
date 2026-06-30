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
  fontFamily: 'monospace',
}

export const OVERLAY_DARK_BG = 'rgba(0, 0, 0, 0.7)'