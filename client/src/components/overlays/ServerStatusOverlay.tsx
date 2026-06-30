import {
  OVERLAY_BASE_STYLE,
  OVERLAY_DARK_BG,
  OVERLAY_MONOSPACE_TEXT_STYLE,
} from './overlayStyles'

interface ServerStatusOverlayProps {
  connected: boolean
}

export function ServerStatusOverlay({ connected }: ServerStatusOverlayProps) {
  return (
    <div
      style={{
        right: '8px',
        top: '5px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: OVERLAY_DARK_BG,
        ...OVERLAY_BASE_STYLE,
        ...OVERLAY_MONOSPACE_TEXT_STYLE,
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '999px',
          backgroundColor: connected ? '#35d071' : '#e45050',
          display: 'inline-block',
        }}
      />
      server: {connected ? 'connected' : 'disconnected'}
    </div>
  )
}
