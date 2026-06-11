import { useEffect, useRef } from 'react'
import * as ctx from '../../contexts/snaptunestatecontext'
import p5 from 'p5'
import { Note, WHITE_NOTES, HAS_SHARP_BELOW, GRID_COLS, GRID_ROWS } from '../../types'
import {
  quantizeStroke,
  notesOverlap,
  splitNoteByConflict,
  applyNotesToComposition,
  isInsideRelativeElementPosition
} from '../../utils/noteProcessor'

/**
 * Visual configuration for p5 rendering
 */
const VISUAL_CONFIG = {
  grid: {
    lineColor: [0, 0, 0, 60],
    lineWeight: 0.5,
    majorLineColor: [0, 0, 0, 80],
    majorLineWeight: 1,
  },
  seekbar: {
    color: [76, 102, 207, 40],
  },
  stroke: {
    color: [76, 102, 207],
    lineWeight: 20.0,
  },
  note: {
    fill: [76, 102, 207, 200],
    stroke: [50, 70, 180],
    lineWeight: 2,
  },
  erase: {
    color: [255, 255, 255],
    lineWeight: 20.0,
  },
}


/**
 * NoteSpace component - Main note composition and drawing area
 * Manages stroke input, quantization, and note composition with conflict handling
 */
export function NoteSpace({ progressRef }) {
  //--- Context hooks ---//
  const { drawState } = ctx.useDrawState()
  const { clear: shouldClear } = ctx.useClear()
  const { setClear } = ctx.useUpdateClear()
  const { undo: shouldUndo } = ctx.useUndo()
  const { setUndo } = ctx.useUpdateUndo()

  //--- References ---//
  const containerRef = useRef(null)
  const p5Ref = useRef(null)
  const schedulerRef = useRef(null)
  const animationFrameRef = useRef(null)

  // Refs to sync context state with p5 sketch without remounting
  const drawStateRef = useRef(drawState)
  const clearRef = useRef(shouldClear)
  const undoRef = useRef(shouldUndo)

  //--- Effect hooks to update refs ---//
  useEffect(() => { drawStateRef.current = drawState }, [drawState])
  useEffect(() => { clearRef.current = shouldClear }, [shouldClear])
  useEffect(() => { undoRef.current = shouldUndo }, [shouldUndo])



  /**
   * Initializes and manages p5 sketch
   */
  useEffect(() => {
    const sketch = (p) => {
      let composition = [] // Master array of notes
      let eraseArr = [] // Erase strokes (visual only)
      let currentStroke = [] // Stroke being drawn now

      /**
       * Setup p5 canvas
       */
      p.setup = () => {
        const width = containerRef.current.offsetWidth
        const height = containerRef.current.offsetHeight
        const canvas = p.createCanvas(width, height)
        canvas.parent(containerRef.current)
        p.background(255, 255, 255)
      }

      /**
       * Renders the grid background and lines
       */
      const drawGrid = () => {
        const rowHeight = p.height / GRID_ROWS
        const colWidth = p.width / GRID_COLS

        // Draw horizontal lines and background
        for (let i = 0; i < GRID_ROWS; i++) {
          const y = i * rowHeight
          p.noStroke()
          p.fill(255, 255, 255)
          p.rect(0, y, p.width, rowHeight)
          
          p.stroke(...VISUAL_CONFIG.grid.lineColor)
          p.strokeWeight(VISUAL_CONFIG.grid.lineWeight)
          p.line(0, y, p.width, y)
        }

        // Draw center line
        p.stroke(...VISUAL_CONFIG.grid.majorLineColor)
        p.strokeWeight(VISUAL_CONFIG.grid.majorLineWeight)
        p.line(p.width / 2, 0, p.width / 2, p.height)

        // Draw vertical lines
        for (let i = 1; i < GRID_COLS; i++) {
          const x = i * colWidth
          const isMajor = i % 4 === 0
          p.stroke(...VISUAL_CONFIG.grid.majorLineColor)
          p.strokeWeight(VISUAL_CONFIG.grid.majorLineWeight)
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
        
        p.noStroke()
        p.fill(...VISUAL_CONFIG.seekbar.color)
        p.rect(x - colWidth / 2, 0, colWidth, p.height)
      }

      /**
       * Renders all notes in composition
       */
      const drawComposition = () => {
        if (composition.length === 0) return

        const rowHeight = p.height / GRID_ROWS
        
        for (const note of composition) {
          const pitchIndex = WHITE_NOTES.indexOf(note.pitch)
          const x = note.startTime * p.width
          const y = pitchIndex * rowHeight
          const width = note.duration * p.width
          const height = rowHeight

          p.fill(...VISUAL_CONFIG.note.fill)
          p.stroke(...VISUAL_CONFIG.note.stroke)
          p.strokeWeight(VISUAL_CONFIG.note.lineWeight)
          p.rect(x, y, width, height)
        }
      }

      /**
       * Renders current stroke being drawn
       */
      const drawCurrentStroke = () => {
        if (currentStroke.length < 2) return

        p.stroke(...VISUAL_CONFIG.stroke.color)
        p.strokeWeight(VISUAL_CONFIG.stroke.lineWeight)
        
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

        p.stroke(...VISUAL_CONFIG.erase.color)
        p.strokeWeight(VISUAL_CONFIG.erase.lineWeight)

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
        // Handle clear action
        if (clearRef.current) {
          composition = []
          currentStroke = []
          setClear(false)
        }

        // Handle undo action
        if (undoRef.current) {
          composition.pop()
          setUndo(false)
        }

        // Clear and redraw everything
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
       * Add one note when clicking on the composition grid
       */
      p.mouseClicked = () => {
        // Ensures that we're clicking on the composition
        
        
      }

      /**
       * Track mouse movement to collect stroke points
       */
      p.mouseDragged = () => {
        // ensures that we're dragging on the composition
        if(isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)){
          currentStroke.push([p.mouseX, p.mouseY])
        }
        
      
      }

      /**
       * Process completed stroke
       */
      p.mouseReleased = () => {
        console.log(p.mouseX + ":" + p.mouseY)
        //End of the click event
        if(isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)){
          currentStroke.push([p.mouseX, p.mouseY])
        }
        // if (currentStroke.length < 2) {
        //   currentStroke = []
        //   return
        // }

        if (drawStateRef.current) {
          // Quantize stroke and apply to composition
          const notes = quantizeStroke(currentStroke, p.width, p.height)
          composition = applyNotesToComposition(composition, notes)
          
          // Update scheduler with new composition
          if (schedulerRef.current) {
            schedulerRef.current.updateComposition(composition)
          }
        } else {
          // Add erase stroke (visual only)
          eraseArr.push(currentStroke)
        }

        currentStroke = []
      }
    }

    p5Ref.current = new p5(sketch)

    // Cleanup on unmount
    return () => {
      if (p5Ref.current) {
        p5Ref.current.remove()
        p5Ref.current = null
      }
    }
  }, [setClear, setUndo])

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: '100%',
      background: '#ffffff',
      border: '1px solid #000000',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Note labels sidebar */}
      <div style={{
        position: 'relative',
        width: '100px',
        flexShrink: 0,
        background: '#ffffff',
        borderRight: '2px solid #000000',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {WHITE_NOTES.map((note, index) => (
          <NoteLabelCell
            key={note}
            note={note}
            index={index}
            totalNotes={WHITE_NOTES.length}
            hasSharpBelow={HAS_SHARP_BELOW[note]}
          />
        ))}
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          cursor: 'crosshair',
        }}
      />
    </div>
  )
}

/**
 * NoteLabelCell - Individual note label in sidebar
 */
function NoteLabelCell({ note, index, totalNotes, hasSharpBelow }) {
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        borderBottom: index < totalNotes - 1 ? '1px solid #2a2a3a' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '6px',
      }}
    >
      {/* Note label */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: '12%',
          bottom: '12%',
          width: '46px',
          background: '#fff',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: '10px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            color: '#000000',
            fontWeight: 'normal',
            fontFamily: 'monospace',
          }}
        >
          {note}
        </span>
      </div>

      {/* Sharp indicator */}
      {hasSharpBelow && index < totalNotes - 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '-18%',
            right: '0px',
            width: '60px',
            height: '36%',
            background: '#000',
            zIndex: 2,
          }}
        />
      )}
    </div>
  )
}