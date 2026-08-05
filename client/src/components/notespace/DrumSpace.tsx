import { useState, useRef, useEffect, type MouseEvent, type RefObject } from 'react'
import * as ctx from '../../contexts/snaptunestatecontext'
import { Drum, GRID_COLS, INSTRUMENT_THEMES, Instrument, Note } from '../../types'
interface DrumSpaceProps {
  progressRef: RefObject<number>
}

interface Track {
  label: string
  color: string
}

const TRACKS: Track[] = [
  { label: 'KICK', color: '#cc4410' },
  { label: 'SNARE', color: '#7a9a10' },
  { label: 'HI-HAT', color: '#6655cc' },
  { label: 'CLAP', color: '#4c66cf' },
]

const STEPS = GRID_COLS
const STEPS_PER_MEASURE = STEPS / 2

/**
 * Builds a boolean drum grid from note composition.
 * Each row maps to a drum track, each column to a sequencer step.
 */
function initGrid(composition: Note[]): boolean[][] {
  const grid: boolean[][] = TRACKS.map(() => Array(STEPS).fill(false))
  if (composition && composition.length > 0) {

    for (const note of composition) {
      const trackIdx = Object.values(Drum).indexOf(note.pitch as Drum)
      const stepIdx = Math.floor(note.startTime * STEPS)
      if (trackIdx >= 0 && stepIdx >= 0 && stepIdx < STEPS) {
        grid[trackIdx][stepIdx] = true
      }
    }
  }

  return grid
}

/**
 * Deep equality check for two drum grids to avoid unnecessary state updates.
 */
function gridsAreEqual(a: boolean[][], b: boolean[][]): boolean {
  if (a.length !== b.length) return false

  for (let row = 0; row < a.length; row++) {
    if (a[row].length !== b[row].length) return false

    for (let col = 0; col < a[row].length; col++) {
      if (a[row][col] !== b[row][col]) {
        return false
      }
    }
  }

  return true
}

export function DrumSpace({ progressRef }: DrumSpaceProps) {
  // ---------- Context state ----------
  const { drumsComposition } = ctx.useDrumsComposition()
  const { setDrumsComposition } = ctx.useUpdateDrumsComposition()
  const { clearSignal } = ctx.useClear()

  // ---------- Visual theme ----------
  const drumTheme = INSTRUMENT_THEMES[Instrument.Drums]

  // ---------- Local UI and animation state ----------
  const [grid, setGrid] = useState<boolean[][]>(initGrid(drumsComposition))
  const [mouseDownStep, setMouseDownStep] = useState<boolean | null>(null)
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    // Ignore clear events that are not meant for drums.
    if (clearSignal.target !== 'all' && clearSignal.target !== 'drums') return
    // seq=0 is the provider's initial value, not a real clear request.
    if (clearSignal.seq === 0) return
    
    // A new matching clear event was emitted, so reset both state layers.
    setDrumsComposition([])
    setGrid(initGrid([]))
  }, [clearSignal, setDrumsComposition])

  // Poll progressRef on every animation frame to update the highlighted step
  useEffect(() => {
    const tick = () => {
      if (progressRef?.current != null) {
        const step = Math.floor(progressRef.current * STEPS)
        setCurrentStep(step < STEPS ? step : null)
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)

    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current)
      }
    }
  }, [progressRef])

  // Keep the local grid in sync with external composition updates
  // (e.g. when a transfer merge updates drumsComposition in App.tsx).
  useEffect(() => {
    const nextGrid = initGrid(drumsComposition)
    setGrid((previousGrid) => (gridsAreEqual(previousGrid, nextGrid) ? previousGrid : nextGrid))
  }, [drumsComposition])

  //Rebuild drums composition from boolean grid
  useEffect(() => {
    const newComposition: Note[] = []
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        if (grid[i][j]) {
          newComposition.push(new Note(Object.values(Drum)[i], j / grid[i].length, 1 / STEPS))
        }
      }
    }
    setDrumsComposition(newComposition)
  }, [grid])

  /**
   * Toggles one grid step, or forces a specific value during click-drag paint.
   */
  const toggleStep = (trackIdx: number, stepIdx: number, forceValue?: boolean): void => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row])
      next[trackIdx][stepIdx] = forceValue ?? !prev[trackIdx][stepIdx]
      return next
    })
  }

  // Allow click-drag to paint/erase multiple steps
  const handleMouseDown = (trackIdx: number, stepIdx: number): void => {
    const newVal = !grid[trackIdx][stepIdx]
    setMouseDownStep(newVal)
    toggleStep(trackIdx, stepIdx, newVal)
  }

  const handleMouseEnter = (
    trackIdx: number,
    stepIdx: number,
    event: MouseEvent<HTMLDivElement>
  ): void => {
    if (event.buttons !== 1 || mouseDownStep === null) return
    toggleStep(trackIdx, stepIdx, mouseDownStep)
  }

  const getStepBackground = (
    active: boolean,
    isCurrentStep: boolean,
    relativeStepIdx: number,
    trackColor: string
  ): string => {
    if (isCurrentStep && active) {
      return trackColor
    }

    if (isCurrentStep) {
      return `rgb(${drumTheme.softRgb.join(', ')})`
    }

    if (active) {
      return trackColor
    }

    return relativeStepIdx % 2 === 0 ? '#f0f0f0' : '#e4e4e4'
  }

  const renderStepCell = (
    trackIdx: number,
    absoluteIdx: number,
    relativeStepIdx: number,
    trackColor: string,
    showOutlineOffset: boolean
  ) => {
    const active = grid[trackIdx][absoluteIdx]
    const isCurrentStep = currentStep === absoluteIdx

    return (
      <div
        key={relativeStepIdx}
        onMouseDown={() => handleMouseDown(trackIdx, absoluteIdx)}
        onMouseEnter={(event) => handleMouseEnter(trackIdx, absoluteIdx, event)}
        style={{
          borderRadius: '4px',
          cursor: 'pointer',
          background: getStepBackground(active, isCurrentStep, relativeStepIdx, trackColor),
          ...(showOutlineOffset ? { outlineOffset: '-2px' } : {}),
          boxShadow: active ? `0 0 6px ${trackColor}88` : 'none',
          border: active ? `1px solid ${trackColor}` : `1px solid ${drumTheme.hex}`,
          transition: 'background 0.08s, box-shadow 0.08s',
        }}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#ffffff',
        border: `2px solid ${drumTheme.hex}`,
        borderRadius: '8px',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onMouseUp={() => setMouseDownStep(null)}
      onMouseLeave={() => setMouseDownStep(null)}
    >
      <div
        style={{
          width: '100px',
          flexShrink: 0,
          borderRight: `2px solid ${drumTheme.hex}`,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {TRACKS.map((track, index) => (
          <div
            key={track.label}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: '12px',
              borderBottom: index < TRACKS.length - 1 ? '1px solid #ccc' : 'none',
            }}
          >
            <span
              style={{
                fontSize: '20px',
                fontFamily: 'monospace',
                fontWeight: '600',
                color: track.color,
              }}
            >
              {track.label}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '6px',
          gap: '6px',
        }}
      >
        {TRACKS.map((track, trackIdx) => (
          <div
            key={track.label}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'stretch',
              gap: '4px',
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: `repeat(${STEPS_PER_MEASURE}, 1fr)`,
                gap: '4px',
              }}
            >
              {Array.from({ length: STEPS_PER_MEASURE }).map((_, stepIdx) => {
                return renderStepCell(trackIdx, stepIdx, stepIdx, track.color, true)
              })}
            </div>

            <div
              style={{
                width: '2px',
                flexShrink: 0,
                background: drumTheme.hex,
                borderRadius: '2px',
                margin: '2px 0',
              }}
            />

            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: `repeat(${STEPS_PER_MEASURE}, 1fr)`,
                gap: '4px',
              }}
            >
              {Array.from({ length: STEPS_PER_MEASURE }).map((_, stepIdx) => {
                const absoluteIdx = stepIdx + STEPS_PER_MEASURE
                return renderStepCell(trackIdx, absoluteIdx, stepIdx, track.color, false)
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}