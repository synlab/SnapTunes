import { useEffect, useRef, type RefObject } from 'react'
import * as ctx from '../../contexts/snaptunestatecontext'
import p5 from 'p5'
import { Instrument, INSTRUMENT_THEMES, Note, WHITE_NOTES, HAS_SHARP_BELOW, GRID_COLS, GRID_ROWS, type InstrumentTheme } from '../../types'
import { quantizeStroke, applyNotesToComposition, isInsideRelativeElementPosition } from '../../utils/noteProcessor'

type P5Instance = InstanceType<typeof p5>
type StrokePoint = readonly [number, number]

interface NoteSpaceProps {
  progressRef: RefObject<number>
}

interface NoteLabelCellProps {
  note: string
  octave: number
  index: number
  totalNotes: number
  hasSharpBelow: boolean
  accentColor: string
  accentBackground: string
}

const createVisualConfig = (theme: InstrumentTheme) => ({
  grid: {
    lineColor: [0, 0, 0, 60] as const,
    lineWeight: 0.5,
    majorLineColor: [0, 0, 0, 80] as const,
    majorLineWeight: 1,
  },
  seekbar: {
    color: theme.seekbar,
  },
  stroke: {
    color: theme.rgb,
    lineWeight: 20,
  },
  note: {
    fill: theme.noteFill,
    stroke: theme.noteStroke,
    lineWeight: 2,
  },
  erase: {
    color: [255, 255, 255] as const,
    lineWeight: 20,
  },
})


/**
 * Visual configuration for p5 rendering
 */
/**
 * NoteSpace component - Main note composition and drawing area
 * Manages stroke input, quantization, and note composition with conflict handling
 */
export function NoteSpace({ progressRef }: NoteSpaceProps) {
  //--- Context hooks ---//
  const { drawState } = ctx.useDrawState()
  const { clear: shouldClear } = ctx.useClear()
  const { setClear } = ctx.useUpdateClear()
  const { undo: shouldUndo } = ctx.useUndo()
  const { setUndo } = ctx.useUpdateUndo()
  const { composition } = ctx.useComposition()
  const { setComposition } = ctx.useUpdateComposition()
  const { octave } = ctx.useOctave()
  const { instrument } = ctx.useInstrument()
  const activeInstrument = instrument ?? Instrument.Piano
  const activeTheme = INSTRUMENT_THEMES[activeInstrument]

  //--- References ---//
  const containerRef = useRef<HTMLDivElement | null>(null)
  const p5Ref = useRef<P5Instance | null>(null)

  // Refs to sync context state with p5 sketch without remounting
  const drawStateRef = useRef<boolean>(drawState)
  const clearRef = useRef<boolean>(shouldClear)
  const undoRef = useRef<boolean>(shouldUndo)
  const instrumentThemeRef = useRef<InstrumentTheme>(activeTheme)

  //--- Effect hooks to update refs ---//
  useEffect(() => {
    drawStateRef.current = drawState
  }, [drawState])

  useEffect(() => {
    clearRef.current = shouldClear
  }, [shouldClear])

  useEffect(() => {
    undoRef.current = shouldUndo
  }, [shouldUndo])

  useEffect(() => {
    instrumentThemeRef.current = activeTheme
  }, [activeTheme])

  /**
   * Initializes and manages p5 sketch
   */
  useEffect(() => {

    if (!containerRef.current) return;

    const sketch = (p: P5Instance) => {
      let compositionTemp: Note[] = composition// Master array of notes
      let eraseArr: StrokePoint[][] = [] // Erase strokes (visual only)
      let currentStroke: StrokePoint[] = [] // Stroke being drawn now


      /**
       * Setup p5 canvas
       */
      p.setup = () => {
        const width = containerRef.current?.offsetWidth ?? 0
        const height = containerRef.current?.offsetHeight ?? 0
        const canvas = p.createCanvas(width, height)
        canvas.style('position', 'absolute')
        canvas.style('top', '0')
        canvas.style('left', '0')
        canvas.parent(containerRef.current as HTMLDivElement)
        p.background(255, 255, 255)
      }

      /**
       * Renders the grid background and lines
       */
      const drawGrid = () => {
        const visualConfig = createVisualConfig(instrumentThemeRef.current)
        const rowHeight = p.height / GRID_ROWS
        const colWidth = p.width / GRID_COLS

        // Draw horizontal lines and background
        for (let i = 0; i < GRID_ROWS; i++) {
          const y = i * rowHeight
          p.noStroke()
          p.fill(255, 255, 255)
          p.rect(0, y, p.width, rowHeight)

          p.stroke(...visualConfig.grid.lineColor)
          p.strokeWeight(visualConfig.grid.lineWeight)
          p.line(0, y, p.width, y)
        }

        // Draw center line
        p.stroke(...visualConfig.grid.majorLineColor)
        p.strokeWeight(visualConfig.grid.majorLineWeight)
        p.line(p.width / 2, 0, p.width / 2, p.height)

        // Draw vertical lines
        for (let i = 1; i < GRID_COLS; i++) {
          const x = i * colWidth
          p.stroke(...visualConfig.grid.majorLineColor)
          p.strokeWeight(visualConfig.grid.majorLineWeight)
          p.line(x, 0, x, p.height)
        }
      }

      /**
       * Renders the playback seekbar
       */
      const drawSeekbar = () => {
        if (progressRef?.current === null || progressRef?.current === undefined) return

        const x = progressRef.current * p.width
        const colWidth = p.width / GRID_COLS

        const visualConfig = createVisualConfig(instrumentThemeRef.current)
        p.noStroke()
        p.fill(...visualConfig.seekbar.color)
        p.rect(x - colWidth / 2, 0, colWidth, p.height)
      }

      /**
       * Renders all notes in composition
       */
      const drawComposition = () => {
        if (compositionTemp.length === 0) return

        const rowHeight = p.height / GRID_ROWS

        for (const note of compositionTemp) {
          const pitchIndex = WHITE_NOTES.indexOf(note.pitch as (typeof WHITE_NOTES)[number])
          const x = note.startTime * p.width
          const y = pitchIndex * rowHeight
          const width = note.duration * p.width
          const height = rowHeight

          const visualConfig = createVisualConfig(instrumentThemeRef.current)
          p.fill(...visualConfig.note.fill)
          p.stroke(...visualConfig.note.stroke)
          p.strokeWeight(visualConfig.note.lineWeight)
          p.rect(x, y, width, height)
        }
      }

      /**
       * Renders current stroke being drawn
       */
      const drawCurrentStroke = () => {
        if (currentStroke.length < 2) return

        const visualConfig = createVisualConfig(instrumentThemeRef.current)
        p.stroke(...visualConfig.stroke.color)
        p.strokeWeight(visualConfig.stroke.lineWeight)

        for (let i = 1; i < currentStroke.length; i++) {
          const [x1, y1] = currentStroke[i - 1]
          const [x2, y2] = currentStroke[i]
          p.line(x1, y1, x2, y2)
        }
      }

      /**
       * Renders erase strokes
       */
      const drawEraseStrokes = () => {
        if (eraseArr.length === 0) return

        const visualConfig = createVisualConfig(instrumentThemeRef.current)
        p.stroke(...visualConfig.erase.color)
        p.strokeWeight(visualConfig.erase.lineWeight)

        for (const eraseStroke of eraseArr) {
          for (let i = 1; i < eraseStroke.length; i++) {
            const [x1, y1] = eraseStroke[i - 1]
            const [x2, y2] = eraseStroke[i]
            p.line(x1, y1, x2, y2)
          }
        }
      }

      /**
      * Main draw loop
      */
      p.draw = () => {
        if (clearRef.current) {
          compositionTemp = []
          currentStroke = []
          setClear(false)
        }

        if (undoRef.current) {
          compositionTemp.pop()
          setUndo(false)
        }

        p.clear()
        p.background(255, 255, 255)
        drawGrid()
        drawSeekbar()
        drawEraseStrokes()
        drawComposition()

        if (drawStateRef.current) {
          drawCurrentStroke()
        }
      }

      /**
       * Track mouse movement to collect stroke points
       */
      p.mouseDragged = () => {
        if (isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)) {
          currentStroke.push([p.mouseX, p.mouseY])
        }
      }

      /**
       * Process completed stroke
       */
      p.mouseReleased = () => {
        if (isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)) {
          currentStroke.push([p.mouseX, p.mouseY])
        }

        if (drawStateRef.current) {
          // Quantize stroke and apply to composition
          const notes = quantizeStroke(currentStroke, p.width, p.height)
          compositionTemp = applyNotesToComposition(compositionTemp, notes)

          // Update composition with new composition
          setComposition(compositionTemp)

        } else {
          // Add erase stroke (visual only)
          eraseArr.push(currentStroke)
        }

        currentStroke = []
      }
    }

    p5Ref.current = new p5(sketch)

    //Handling canvas updates when the container is resized
    let resizeTimeout: NodeJS.Timeout;
    const resizeObserver = new ResizeObserver((entries) => {
      // Clear the previous resizing if an new one arrived immediately
      clearTimeout(resizeTimeout);

      // Programm a resizing in 150ms
      resizeTimeout = setTimeout(() => {
        for (let entry of entries) {
          const { width, height } = entry.contentRect;
          if (p5Ref.current) {
            p5Ref.current.resizeCanvas(width, height);
          }
        }
      }, 150); // wait for 150ms to prevent a performance drop
    });

    resizeObserver.observe(containerRef.current)

    // Cleanup on unmount
    return () => {
      resizeObserver.disconnect()
      if (p5Ref.current) {
        p5Ref.current.remove()
        p5Ref.current = null
      }
    }
  }, [progressRef, setClear, setUndo])


  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#ffffff',
        border: `2px solid ${activeTheme.hex}`,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >

      <div
        style={{
          position: 'relative',
          width: '100px',
          flexShrink: 0,
          background: `rgb(${activeTheme.softRgb.join(', ')})`,
          borderRight: `2px solid ${activeTheme.hex}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {WHITE_NOTES.map((note, index) => (
          <NoteLabelCell
            key={note}
            note={note}
            octave={octave}
            index={index}
            totalNotes={WHITE_NOTES.length}
            hasSharpBelow={HAS_SHARP_BELOW[note]}
            accentColor={activeTheme.hex}
            accentBackground={`rgb(${activeTheme.softRgb.join(', ')})`}
          />
        ))}
      </div>

      <div
        ref={containerRef}
        id='canvas-container'
        style={{
          flex: 1,
          position: 'relative',
          cursor: 'crosshair',
          minWidth: 0,
          minHeight: 0,
        }}
      />
    </div>
  )
}

/**
 * NoteLabelCell - Individual note label in sidebar
 */
function NoteLabelCell({ note, octave, index, totalNotes, hasSharpBelow, accentColor, accentBackground }: NoteLabelCellProps) {
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        borderBottom: index < totalNotes - 1 ? `1px solid ${accentColor}` : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '6px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: '12%',
          bottom: '12%',
          width: '46px',
          background: accentBackground,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: '10px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            color: accentColor,
            fontWeight: 'normal',
            fontFamily: 'monospace',
          }}
        >
          {note}{octave}
        </span>
      </div>

      {hasSharpBelow && index < totalNotes - 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '-18%',
            right: '0px',
            width: '60px',
            height: '36%',
            background: accentColor,
            zIndex: 2,
          }}
        />
      )}
    </div>
  )
}