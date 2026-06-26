import { useState, type ReactNode } from 'react'
import { IconButton, Tooltip } from '@mui/material'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import UndoRoundedIcon from '@mui/icons-material/UndoRounded'
import RedoRoundedIcon from '@mui/icons-material/RedoRounded'
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded'
import LibraryMusicRoundedIcon from '@mui/icons-material/LibraryMusicRounded'
import { LuEraser } from 'react-icons/lu'
import * as ctx from '../contexts/snaptunestatecontext'
import { Instrument } from '../types'

const TOOLS = { DRAW: 'draw', ERASE: 'erase' } as const

interface ChordPreset {
  label: string
  notes: string[]
}

const CHORD_PRESETS: ChordPreset[] = [
  { label: 'Major', notes: [] },
  { label: 'Minor', notes: [] },
  { label: 'Diminished', notes: [] },
  { label: 'Augmented', notes: [] },
  { label: 'Seventh', notes: [] },
]

interface ToolButtonProps {
  tool: (typeof TOOLS)[keyof typeof TOOLS]
  icon: ReactNode
  label: string
  onClick: () => void
}

interface ActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
}

export function ControlPanel() {
  const { setUndo } = ctx.useUpdateUndo()
  const { requestClear } = ctx.useUpdateClear()
  const { setDrawState } = ctx.useUpdateDrawState()
  const { instrument } = ctx.useInstrument()

  const [activeTool, setActiveTool] = useState<(typeof TOOLS)[keyof typeof TOOLS]>(TOOLS.DRAW)
  const [chordMenuOpen, setChordMenuOpen] = useState<boolean>(false)

  const toolBtn = ({ tool, icon, label, onClick }: ToolButtonProps) => (
    <Tooltip title={label} placement="top">
      <IconButton
        onClick={onClick}
        sx={{
          color: activeTool === tool ? '#fff' : '#4c66cf',
          backgroundColor: activeTool === tool ? '#4c66cf' : '#fff',
          borderRadius: '6px',
          border: '1px solid #ccc',
          width: '80px',
          height: '50px',
          transition: 'all 0.15s',
          '&:hover': {
            backgroundColor: activeTool === tool ? '#d0d0d0' : '#f0f0f0',
          },
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  )

  const actionBtn = ({ icon, label, onClick }: ActionButtonProps) => (
    <Tooltip title={label} placement="top">
      <IconButton
        onClick={onClick}
        sx={{
          color: '#4c66cf',
          backgroundColor: '#fff',
          borderRadius: '6px',
          border: '1px solid #ccc',
          width: '50px',
          height: '50px',
          transition: 'all 0.15s',
          '&:hover': { backgroundColor: '#f0f0f0' },
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  )

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2fr',
        gap: '8px',
        width: '100%',
        height: '100%',
        background: '#86a7e1',
        borderRadius: '8px',
        padding: '8px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <div
        style={{
          borderRadius: '6px',
          backgroundColor: '#fff',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#4c66cf',
            fontFamily: 'monospace',
            letterSpacing: '0.1em',
          }}
        >
          SFX
        </span>
        <div style={{ flex: 1 }} />
      </div>

      <div
        style={{
          borderRadius: '6px',
          backgroundColor: '#fff',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overflow: 'visible',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#4c66cf',
            fontFamily: 'monospace',
            letterSpacing: '0.1em',
          }}
        >
          TOOLS
        </span>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {toolBtn({
            tool: TOOLS.DRAW,
            icon: <EditRoundedIcon fontSize="small" />,
            label: 'Draw',
            onClick: () => {
              setActiveTool(TOOLS.DRAW)
              setDrawState(true)
            },
          })}
          {toolBtn({
            tool: TOOLS.ERASE,
            icon: <LuEraser />,
            label: 'Erase',
            onClick: () => {
              setActiveTool(TOOLS.ERASE)
              setDrawState(false)
            },
          })}

          <div style={{ width: '1px', height: '28px', background: '#4c66cf', margin: '0 2px' }} />

          {actionBtn({ icon: <UndoRoundedIcon fontSize="small" />, label: 'Undo', onClick: () => setUndo(true) })}
          {actionBtn({ icon: <RedoRoundedIcon fontSize="small" />, label: 'Redo', onClick: () => {} })}
          {
            actionBtn({
              icon: <DeleteSweepRoundedIcon fontSize="small" />,
              label: 'Erase All',
              onClick: () => requestClear(instrument === Instrument.Drums ? 'drums' : 'melodic'),
            })
          }

          <div style={{ width: '1px', height: '28px', background: '#4c66cf', margin: '0 2px' }} />

          <div style={{ position: 'relative' }}>
            {actionBtn({
              icon: <LibraryMusicRoundedIcon fontSize="small" />,
              label: 'Chord Presets',
              onClick: () => setChordMenuOpen((open) => !open),
            })}

            {chordMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: 0,
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  padding: '6px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '4px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  zIndex: 100,
                  minWidth: '160px',
                }}
              >
                <span
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: '10px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    letterSpacing: '0.1em',
                    color: '#4c66cf',
                    paddingBottom: '4px',
                    borderBottom: '1px solid #eee',
                    marginBottom: '2px',
                  }}
                >
                  CHORDS
                </span>
                {CHORD_PRESETS.map((chord) => (
                  <button
                    key={chord.label}
                    onClick={() => {
                      setChordMenuOpen(false)
                    }}
                    style={{
                      background: '#f5f5f5',
                      border: '1px solid #ddd',
                      borderRadius: '5px',
                      padding: '5px 8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      color: '#4c66cf',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = '#e8e8e8'
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = '#f5f5f5'
                    }}
                  >
                    {chord.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}