import {
  OVERLAY_BASE_STYLE,
  OVERLAY_DARK_BG,
  OVERLAY_MONOSPACE_TEXT_STYLE,
} from './overlayStyles'

interface GroupStatusOverlayProps {
  groupLabel: string
  positionLabel: string
  bpmLabel: number
}

export function GroupStatusOverlay({ groupLabel, positionLabel, bpmLabel }: GroupStatusOverlayProps) {
  return (
    <div
      style={{
        left: '8px',
        top: '8px',
        backgroundColor: OVERLAY_DARK_BG,
        ...OVERLAY_BASE_STYLE,
        ...OVERLAY_MONOSPACE_TEXT_STYLE,
      }}
    >
      group: {groupLabel}<br />
      pos: {positionLabel}<br />
      bpm: {bpmLabel}
    </div>
  )
}
