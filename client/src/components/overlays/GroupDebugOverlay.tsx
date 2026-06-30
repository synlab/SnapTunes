import {
  OVERLAY_BASE_STYLE,
  OVERLAY_MONOSPACE_TEXT_STYLE,
} from './overlayStyles'

interface GroupDebugOverlayProps {
  enabled: boolean
  groupId: string | null
  columnIndex: number | null
  scheduleToken: number | null
  serverClockOffsetMs: number
}

export function GroupDebugOverlay({
  enabled,
  groupId,
  columnIndex,
  scheduleToken,
  serverClockOffsetMs,
}: GroupDebugOverlayProps) {
  if (!enabled) {
    return null
  }

  return (
    <div
      style={{
        right: '8px',
        bottom: '8px',
        backgroundColor: 'rgba(12, 16, 24, 0.82)',
        lineHeight: 1.35,
        ...OVERLAY_BASE_STYLE,
        ...OVERLAY_MONOSPACE_TEXT_STYLE,
      }}
    >
      group debug<br />
      group: {groupId ?? 'none'}<br />
      column: {columnIndex ?? 'n/a'}<br />
      token: {scheduleToken ?? 'n/a'}<br />
      clock offset: {Math.round(serverClockOffsetMs)} ms
    </div>
  )
}
