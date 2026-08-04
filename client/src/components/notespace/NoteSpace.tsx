import { useEffect, useRef, useState, type RefObject } from 'react'
import * as ctx from '../../contexts/snaptunestatecontext'
import * as simsnapctx from '../../contexts/simsnapcontext'
import p5 from 'p5'
import { Instrument, INSTRUMENT_THEMES, Note, CHROMATIC_NOTES, GRID_COLS, GRID_ROWS, type InstrumentTheme } from '../../types'
import { applyNotesToComposition, gridSpanToNote, isInsideRelativeElementPosition, notesOverlap, pointToGridCell } from '../../utils/noteProcessor'

interface NoteSpaceProps {
  progressRef: RefObject<number>
  playbackState?: 0 | 1 | 2 | 'stop' // 0 = paused/reset, 1 = playing
}

type P5Instance = InstanceType<typeof p5>
type StrokePoint = readonly [number, number]
type ResizeHandle = 'left' | 'right'
type SelectionState = {
  note: Note            // working copy — mutated during resize drag
  originalNote: Note    // reference identity into compositionTemp for lookups
  isDraggingHandle: ResizeHandle | null
  dragStartLength: number
  dragStartCol: number
}
// Draw mode keeps one active ghost note locked to a single pitch row.
type DrawGesture = {
  anchorCol: number
  currentCol: number
  row: number
}
type PendingLongPressDrag = {
  sourceNote: Note
  pressX: number
  pressY: number
  startedAtMs: number
}
type ActiveDraggedNote = {
  sourceNote: Note
  draftNote: Note
  pointerColOffset: number
  pointerOffsetX: number
  pointerOffsetY: number
}

interface DragOverlayState {
  visible: boolean
  x: number
  y: number
  width: number
  height: number
  isEntering: boolean
}

interface NoteLabelCellProps {
  note: string
  octave: number
  index: number
  totalNotes: number
  accentColor: string
}


const DRAG_OVERLAY_ENTER_PULSE_KEYFRAMES = `@keyframes dragOverlayEnterPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}`

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
 * NoteSpace component - Main note composition and drawing area
 * Manages ghost-note input and note composition with conflict handling
 */
export function NoteSpace({ progressRef, playbackState }: NoteSpaceProps) {
  //--- Context hooks ---//
  const { drawState } = ctx.useDrawState()
  const { clearSignal } = ctx.useClear()
  const { undo: shouldUndo } = ctx.useUndo()
  const { setUndo } = ctx.useUpdateUndo()
  const { composition } = ctx.useComposition()
  const { setComposition } = ctx.useUpdateComposition()
  const { compositionHistory } = ctx.useCompositionHistory()
  const { setCompositionHistory } = ctx.useUpdateCompositionHistory()
  const { octave } = ctx.useOctave()
  const { instrument } = ctx.useInstrument()

  // Context for tracking the last time a snap or unsnap event occurred, used to determine if an undo should be triggered after such events.
  const { lastTimeSnapOrUnsnapContext } = simsnapctx.useLastTimeSnapOrUnsnapContext()

  // Local state for tracking the last time the composition was updated, used to determine if an undo should be triggered after a snap/unsnap event.
  const [lastCompositionUpdateTime, setLastCompositionUpdateTime] = useState<number>(0)

  const activeInstrument = instrument ?? Instrument.Piano
  const activeTheme = INSTRUMENT_THEMES[activeInstrument]
  const [dragOverlay, setDragOverlay] = useState<DragOverlayState>({
    visible: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isEntering: false,
  })
  const dragOverlayEnterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // selectedNoteRef is the single source of truth for selection — never useState, to avoid
  // triggering p5 sketch remounts and React re-renders during pointer interactions.
  const selectedNoteRef = useRef<SelectionState | null>(null)
  const tapDetectionRef = useRef<{ noteId: string; x: number; y: number; timestamp: number } | null>(null)
  const playbackStateRef = useRef<1 | 2 | 0 | 'stop' | undefined>(playbackState)

  //--- References ---//
  const containerRef = useRef<HTMLDivElement | null>(null)
  const p5Ref = useRef<P5Instance | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyRef = useRef<Note[][]>(compositionHistory) // History of compositions for undo functionality

  // Refs to sync context state with p5 sketch without remounting
  const drawStateRef = useRef<boolean>(drawState)
  const clearSignalRef = useRef(clearSignal)
  const undoRef = useRef<boolean>(shouldUndo)
  const instrumentThemeRef = useRef<InstrumentTheme>(activeTheme)
  const compositionStateRef = useRef<Note[]>(composition)

  //--- Effect hooks to update refs ---//
  useEffect(() => {
    drawStateRef.current = drawState
  }, [drawState])

  useEffect(() => {
    clearSignalRef.current = clearSignal
  }, [clearSignal])

  useEffect(() => {
    undoRef.current = shouldUndo
  }, [shouldUndo])

  useEffect(() => {
    instrumentThemeRef.current = activeTheme
  }, [activeTheme])

  useEffect(() => {
    compositionStateRef.current = composition
  }, [composition])

  useEffect(() => {
    return () => {
      setCompositionHistory(historyRef.current) // Save the history to context when the component unmounts
    }
  }, [historyRef, setCompositionHistory])

  useEffect(() => {
    playbackStateRef.current = playbackState
  }, [playbackState])

  useEffect(() => {
    // Cancel selection on any snap/unsnap gesture
    selectedNoteRef.current = null
    if(lastCompositionUpdateTime === 0 || lastTimeSnapOrUnsnapContext === 0) return // Skip undo check on initial render
    const difference = Math.abs(lastCompositionUpdateTime - lastTimeSnapOrUnsnapContext)
    if (difference < 50) {
      setUndo(true)
    }
  }, [lastTimeSnapOrUnsnapContext])


  /**
   * Initializes and manages p5 sketch
   */
  useEffect(() => {

    if (!containerRef.current) return;

    const sketch = (p: P5Instance) => {
      const LONG_PRESS_MS = 100
      const LONG_PRESS_MOVE_TOLERANCE_PX = 10
      const isMelodicClearTarget = (target: ctx.ClearTarget): boolean =>
        target === 'all' || target === 'melodic'
      let compositionTemp: Note[] = composition// Master array of notes
      let eraseArr: StrokePoint[][] = [] // Erase strokes (visual only)
      let currentStroke: StrokePoint[] = [] // Stroke being drawn now (erase mode)
      // Null when there is no draw interaction in progress.
      let drawGesture: DrawGesture | null = null
      let pendingLongPressDrag: PendingLongPressDrag | null = null
      let activeDraggedNote: ActiveDraggedNote | null = null
      // Tracks the last clear event consumed by this sketch instance.
      let lastHandledClearSeq = clearSignalRef.current.seq
      // Local selection state mirror for sketch (to avoid state update latency)
      let sketchSelectedNote: SelectionState | null = null
      const HANDLE_WIDTH = 14 // Half-width in pixels for handle hit detection and rendering

      const clearLongPressTimer = () => {
        if (!longPressTimerRef.current) return
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }

      const clearDragAndDropState = () => {
        clearLongPressTimer()
        pendingLongPressDrag = null
        activeDraggedNote = null
        // Only clear selection if not explicitly keeping it
        // (selection is managed separately)
        if (dragOverlayEnterTimerRef.current) {
          clearTimeout(dragOverlayEnterTimerRef.current)
          dragOverlayEnterTimerRef.current = null
        }
        setDragOverlay((prev) => (prev.visible ? { ...prev, visible: false, isEntering: false } : prev))
      }

      const getNoteDurationCols = (note: Note): number => {
        return Math.max(1, Math.round(note.duration * GRID_COLS))
      }

      const clampPointerToGrid = (x: number, y: number) => {
        const clampedX = Math.max(0, Math.min(x, p.width - Number.EPSILON))
        const clampedY = Math.max(0, Math.min(y, p.height - Number.EPSILON))
        const { col, row } = pointToGridCell(clampedX, clampedY, p.width, p.height)
        return { clampedX, clampedY, col, row }
      }

      const getNoteRect = (note: Note) => {
        const rowHeight = p.height / GRID_ROWS
        const pitchIndex = CHROMATIC_NOTES.indexOf(note.pitch as (typeof CHROMATIC_NOTES)[number])
        return {
          x: note.startTime * p.width,
          y: pitchIndex * rowHeight,
          width: note.duration * p.width,
          height: rowHeight,
        }
      }

      const getHandleAtPosition = (x: number, y: number, note: Note): ResizeHandle | null => {
        const rect = getNoteRect(note)
        const rowHeight = p.height / GRID_ROWS
        const isVerticallyInNote = y >= rect.y && y <= rect.y + rect.height
        if (!isVerticallyInNote) return null

        const leftEdge = rect.x
        const rightEdge = rect.x + rect.width

        if (Math.abs(x - leftEdge) <= HANDLE_WIDTH) return 'left'
        if (Math.abs(x - rightEdge) <= HANDLE_WIDTH) return 'right'
        return null
      }

      const applyResizeToNote = (note: Note, newStartCol: number, newEndCol: number): Note => {
        const duration = Math.max(1, newEndCol - newStartCol + 1) / GRID_COLS
        return new Note(note.pitch, newStartCol / GRID_COLS, duration)
      }

      /**
       * Commits the selected note’s working copy to composition using the same
       * split-or-replace overlap logic as note creation and move.
       * Called on normal selection exit; NOT called on gesture-cancel (discard).
       */
      const commitSelectionExit = () => {
        if (!sketchSelectedNote) return
        const original = sketchSelectedNote.originalNote
        const updated = sketchSelectedNote.note
        const changed = original.startTime !== updated.startTime || original.duration !== updated.duration
        if (changed) {

          const withoutOriginal = compositionTemp.filter(n => n !== original)
          compositionTemp = applyNotesToComposition(withoutOriginal, [updated])
          historyRef.current.push([...compositionTemp])
          setComposition([...compositionTemp])
          setLastCompositionUpdateTime(Date.now())
        }
        sketchSelectedNote = null
        selectedNoteRef.current = null
      }

      const updateDragOverlay = (pointerX: number, pointerY: number) => {
        if (!activeDraggedNote) return

        const rect = getNoteRect(activeDraggedNote.sourceNote)
        const baseX = pointerX - activeDraggedNote.pointerOffsetX
        const baseY = pointerY - activeDraggedNote.pointerOffsetY
        const scale = 1.03
        const width = rect.width * scale
        const height = rect.height * scale
        const x = baseX - (width - rect.width) / 2
        const y = baseY - (height - rect.height) / 2

        let shouldAnimateIn = false
        setDragOverlay((prev) => {
          shouldAnimateIn = !prev.visible
          return {
            visible: true,
            x,
            y,
            width,
            height,
            isEntering: shouldAnimateIn ? true : prev.isEntering,
          }
        })

        if (shouldAnimateIn) {
          if (dragOverlayEnterTimerRef.current) {
            clearTimeout(dragOverlayEnterTimerRef.current)
          }
          dragOverlayEnterTimerRef.current = setTimeout(() => {
            setDragOverlay((prev) => (prev.visible ? { ...prev, isEntering: false } : prev))
            dragOverlayEnterTimerRef.current = null
          }, 220)
        }
      }

      const getNoteAtPosition = (x: number, y: number): Note | null => {
        const rowHeight = p.height / GRID_ROWS

        // Reverse iteration matches draw order so top-most visual note wins hit-test.
        for (let i = compositionTemp.length - 1; i >= 0; i--) {
          const note = compositionTemp[i]
          const pitchIndex = CHROMATIC_NOTES.indexOf(note.pitch as (typeof CHROMATIC_NOTES)[number])
          const noteX = note.startTime * p.width
          const noteY = pitchIndex * rowHeight
          const noteWidth = note.duration * p.width
          const noteHeight = rowHeight

          const isInsideNote = x >= noteX && x <= noteX + noteWidth && y >= noteY && y <= noteY + noteHeight
          if (isInsideNote) {
            return note
          }
        }

        return null
      }

      const beginActiveDragFromNote = (sourceNote: Note, pointerX: number, pointerY: number) => {
        const { col } = clampPointerToGrid(pointerX, pointerY)
        const startCol = Math.round(sourceNote.startTime * GRID_COLS)
        const durationCols = getNoteDurationCols(sourceNote)
        const pointerColOffset = Math.max(0, Math.min(col - startCol, durationCols - 1))
        const sourceRect = getNoteRect(sourceNote)

        activeDraggedNote = {
          sourceNote,
          draftNote: new Note(sourceNote.pitch, sourceNote.startTime, sourceNote.duration),
          pointerColOffset,
          pointerOffsetX: pointerX - sourceRect.x,
          pointerOffsetY: pointerY - sourceRect.y,
        }

        pendingLongPressDrag = null
        clearLongPressTimer()
        updateDragOverlay(pointerX, pointerY)
      }

      const updateActiveDragDraft = (pointerX: number, pointerY: number) => {
        if (!activeDraggedNote) return

        const { col, row } = clampPointerToGrid(pointerX, pointerY)

        const durationCols = getNoteDurationCols(activeDraggedNote.sourceNote)
        const maxStartCol = GRID_COLS - durationCols
        const startCol = Math.max(0, Math.min(col - activeDraggedNote.pointerColOffset, maxStartCol))
        const pitch = CHROMATIC_NOTES[row] as (typeof CHROMATIC_NOTES)[number]

        activeDraggedNote.draftNote = new Note(pitch, startCol / GRID_COLS, durationCols / GRID_COLS)
        updateDragOverlay(pointerX, pointerY)
      }


      p.setup = () => {
        sketchSelectedNote = selectedNoteRef.current

        const width = containerRef.current?.offsetWidth ?? 0
        const height = containerRef.current?.offsetHeight ?? 0
        const canvas = p.createCanvas(width, height)
        canvas.style('position', 'absolute')
        canvas.style('top', '0')
        canvas.style('left', '0')
        canvas.parent(containerRef.current as HTMLDivElement)
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
          // SUGGESTION: Playback active, use a slightly tinted background to indicate that notes are being played
          // if (playbackStateRef.current === 1) { 
          //   p.fill(255, 255, 220)
          // } else {
            p.fill(255, 255, 255)
          // }

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
        const barWidth = colWidth / 10;

        const visualConfig = createVisualConfig(instrumentThemeRef.current)
        p.noStroke()
        p.fill(...visualConfig.seekbar.color)
        p.rect(x - barWidth / 2, 0, barWidth, p.height)
      }

      /**
       * Renders all notes in composition
       */
      const drawComposition = () => {
        if (compositionTemp.length === 0) return

        const rowHeight = p.height / GRID_ROWS
        const visualConfig = createVisualConfig(instrumentThemeRef.current)

        for (const note of compositionTemp) {
          if (activeDraggedNote && note === activeDraggedNote.sourceNote) {
            // Hide origin while dragging so users only track the dragged preview.
            continue
          }

          // For the selected note, render the working copy so resize is visible in real time.
          const isSelected = sketchSelectedNote !== null && note === sketchSelectedNote.originalNote
          const displayNote = isSelected ? sketchSelectedNote!.note : note

          const pitchIndex = CHROMATIC_NOTES.indexOf(displayNote.pitch as (typeof CHROMATIC_NOTES)[number])
          const x = displayNote.startTime * p.width
          const y = pitchIndex * rowHeight
          const width = displayNote.duration * p.width
          const height = rowHeight

          p.fill(...visualConfig.note.fill)
          p.stroke(...visualConfig.note.stroke)
          p.strokeWeight(isSelected ? 3 : visualConfig.note.lineWeight)
          p.rect(x, y, width, height)
        }
      }

      const drawGhostNote = () => {
        if (!drawGesture) return

        const rowHeight = p.height / GRID_ROWS
        const colWidth = p.width / GRID_COLS
        const startCol = Math.min(drawGesture.anchorCol, drawGesture.currentCol)
        const endCol = Math.max(drawGesture.anchorCol, drawGesture.currentCol)

        const x = startCol * colWidth
        const y = drawGesture.row * rowHeight
        const width = (endCol - startCol + 1) * colWidth
        const height = rowHeight

        const visualConfig = createVisualConfig(instrumentThemeRef.current)
        const [r, g, b] = visualConfig.note.fill
        const previewNote = gridSpanToNote(drawGesture.anchorCol, drawGesture.currentCol, drawGesture.row)
        // Preview conflict highlighting only; final behavior is handled during commit.
        const hasConflict = compositionTemp.some((existingNote) => notesOverlap(existingNote, previewNote))

        if (hasConflict) {
          p.fill(220, 95, 70, 145)
        } else {
          p.fill(r, g, b, 120)
        }
        p.stroke(...visualConfig.note.stroke)
        p.strokeWeight(visualConfig.note.lineWeight)
        p.rect(x, y, width, height)
      }

      const drawDraggedNotePreview = () => {
        if (!activeDraggedNote) return

        const note = activeDraggedNote.draftNote
        const rowHeight = p.height / GRID_ROWS
        const pitchIndex = CHROMATIC_NOTES.indexOf(note.pitch as (typeof CHROMATIC_NOTES)[number])
        const x = note.startTime * p.width
        const y = pitchIndex * rowHeight
        const width = note.duration * p.width
        const height = rowHeight

        const visualConfig = createVisualConfig(instrumentThemeRef.current)
        const [r, g, b] = visualConfig.note.fill

        // Canvas note acts as snapped ghost under the free-moving HTML drag overlay.
        p.fill(r, g, b, 120)
        p.stroke(...visualConfig.note.stroke)
        p.strokeWeight(visualConfig.note.lineWeight)
        p.rect(x, y, width, height)
      }

      const drawPendingLongPressPreview = () => {
        if (!pendingLongPressDrag || activeDraggedNote) return

        const note = pendingLongPressDrag.sourceNote
        const rowHeight = p.height / GRID_ROWS
        const pitchIndex = CHROMATIC_NOTES.indexOf(note.pitch as (typeof CHROMATIC_NOTES)[number])
        const x = note.startTime * p.width
        const y = pitchIndex * rowHeight
        const width = note.duration * p.width
        const height = rowHeight

        const elapsed = Math.max(0, Date.now() - pendingLongPressDrag.startedAtMs)
        const progress = Math.min(1, elapsed / LONG_PRESS_MS)

        const visualConfig = createVisualConfig(instrumentThemeRef.current)
        const [r, g, b] = visualConfig.note.fill

        p.noStroke()
        p.fill(r, g, b, 55)
        p.rect(x, y, width, height)

        p.noFill()
        p.stroke(...visualConfig.note.stroke)
        p.strokeWeight(1 + progress * 1.5)
        p.rect(x, y, width, height)

        // Thin progress bar at the note bottom to indicate hold-to-drag arming.
        p.noStroke()
        p.fill(...visualConfig.note.stroke, 180)
        p.rect(x, y + height - 3, width * progress, 3)
      }

      const drawDoubleArrowHandle = (cx: number, cy: number, noteHeight: number, color: readonly [number, number, number]) => {
        const bgH = Math.min(noteHeight * 0.75, 26)
        const arrowH = bgH * 0.3
        const tipX = HANDLE_WIDTH - 3

        // Pill background
        p.fill(...color, 200)
        p.noStroke()
        p.rect(cx - HANDLE_WIDTH, cy - bgH / 2, HANDLE_WIDTH * 2, bgH, 4)

        // White arrowheads
        p.fill(255, 255, 255, 245)
        p.triangle(cx - tipX, cy, cx - 2, cy - arrowH, cx - 2, cy + arrowH) // left arrow
        p.triangle(cx + tipX, cy, cx + 2, cy - arrowH, cx + 2, cy + arrowH) // right arrow
        // Center divider bar
        p.rect(cx - 1, cy - arrowH * 0.6, 2, arrowH * 1.2)
      }

      const drawSelectedNoteHandles = () => {
        if (!sketchSelectedNote) return

        const note = sketchSelectedNote.note
        const rect = getNoteRect(note)
        const cy = rect.y + rect.height / 2
        const visualConfig = createVisualConfig(instrumentThemeRef.current)

        drawDoubleArrowHandle(rect.x, cy, rect.height, visualConfig.note.stroke)
        drawDoubleArrowHandle(rect.x + rect.width, cy, rect.height, visualConfig.note.stroke)
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
        // Sync selection from ref into local sketch variable each frame.
        // Using a ref avoids remounting the sketch when selection changes.
        sketchSelectedNote = selectedNoteRef.current

        const latestCompositionFromContext = compositionStateRef.current
        if (latestCompositionFromContext !== compositionTemp) {
          // Accept out-of-band composition updates (e.g. socket transfer merges)
          // so the sketch reflects shared-state changes immediately.
          compositionTemp = latestCompositionFromContext
          
          if (sketchSelectedNote) {
            sketchSelectedNote = null
            selectedNoteRef.current = null
          }
          clearDragAndDropState()
          drawGesture = null
        }

        const latestClearSignal = clearSignalRef.current
        if (latestClearSignal.seq !== lastHandledClearSeq) {
          lastHandledClearSeq = latestClearSignal.seq
          if (isMelodicClearTarget(latestClearSignal.target)) {
            // Consume this clear event exactly once for melodic notes.
            compositionTemp = []
            currentStroke = []
            drawGesture = null
            sketchSelectedNote = null
            selectedNoteRef.current = null
            clearDragAndDropState()
            setComposition([])
          }
        }

        if (undoRef.current) {
          // Undo functionality: revert to the last composition state in history
          historyRef.current.pop()
          compositionTemp = historyRef.current[historyRef.current.length - 1] || []
          setComposition(compositionTemp)
          drawGesture = null
          sketchSelectedNote = null
          selectedNoteRef.current = null
          clearDragAndDropState()
          undoRef.current = false
          setUndo(false)
        }

        if (!drawStateRef.current) {
          commitSelectionExit() // commit any pending resize before leaving draw mode
          drawGesture = null
          clearDragAndDropState()
        }

        p.clear()
        p.background(255, 255, 255)
        drawGrid()
        drawSeekbar()
        drawEraseStrokes()
        drawComposition()

        if (drawStateRef.current) {
          drawPendingLongPressPreview()
          drawGhostNote()
          drawDraggedNotePreview()
          drawSelectedNoteHandles()
        }
      }

      p.mousePressed = () => {
        if (!isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)) {
          // Tap anywhere outside canvas — commit and deselect if a note was selected
          if (sketchSelectedNote) commitSelectionExit()
          return
        }

        if (drawStateRef.current) {
          // If a note is selected, check if we're clicking on a handle for resize
          if (sketchSelectedNote) {
            const handle = getHandleAtPosition(p.mouseX, p.mouseY, sketchSelectedNote.note)
            if (handle) {
              // Start resize drag — record the fixed edge col for snapping
              const startCol = Math.round(sketchSelectedNote.note.startTime * GRID_COLS)
              const durationCols = Math.max(1, Math.round(sketchSelectedNote.note.duration * GRID_COLS))
              sketchSelectedNote.isDraggingHandle = handle
              sketchSelectedNote.dragStartLength = durationCols
              sketchSelectedNote.dragStartCol = startCol
              // selectedNoteRef.current is the same object — mutation is reflected immediately
              return
            }

            // Tapping inside the selected note (not on a handle): stay in selection mode,
            // block long-press drag and draw gesture activation.
            const rect = getNoteRect(sketchSelectedNote.note)
            const insideSelectedNote = p.mouseX >= rect.x && p.mouseX <= rect.x + rect.width &&
              p.mouseY >= rect.y && p.mouseY <= rect.y + rect.height
            if (insideSelectedNote) {
              return
            }

            // Tapped outside — commit resize (if any) and deselect.
            // Return immediately: the tap that deselects must NOT also draw a new note.
            commitSelectionExit()
            return
          }

          const noteUnderPointer = getNoteAtPosition(p.mouseX, p.mouseY)
          if (noteUnderPointer) {
            // Start tap detection for single-tap selection
            drawGesture = null
            tapDetectionRef.current = {
              noteId: noteUnderPointer.pitch + noteUnderPointer.startTime,
              x: p.mouseX,
              y: p.mouseY,
              timestamp: Date.now(),
            }
            pendingLongPressDrag = {
              sourceNote: noteUnderPointer,
              pressX: p.mouseX,
              pressY: p.mouseY,
              startedAtMs: Date.now(),
            }

            clearLongPressTimer()
            longPressTimerRef.current = setTimeout(() => {
              if (!pendingLongPressDrag || !tapDetectionRef.current) return
              // Long press -> activate drag-to-move
              tapDetectionRef.current = null
              beginActiveDragFromNote(
                pendingLongPressDrag.sourceNote,
                pendingLongPressDrag.pressX,
                pendingLongPressDrag.pressY
              )
            }, LONG_PRESS_MS)
            return
          }

          // Pitch is clamped to the row where the pointer/finger starts.
          const { col, row } = pointToGridCell(p.mouseX, p.mouseY, p.width, p.height)
          drawGesture = {
            anchorCol: col,
            currentCol: col,
            row,
          }
          currentStroke = []
          return
        }

        currentStroke = [[p.mouseX, p.mouseY]]
      }

      /**
       * Track mouse movement to collect gesture updates
       */
      p.mouseDragged = () => {
        if (drawStateRef.current) {
          // If dragging a resize handle, update the draft resize
          if (sketchSelectedNote && sketchSelectedNote.isDraggingHandle) {
            const { col } = clampPointerToGrid(p.mouseX, p.mouseY)
            const startCol = sketchSelectedNote.dragStartCol
            const maxCol = GRID_COLS - 1

            if (sketchSelectedNote.isDraggingHandle === 'left') {
              // Dragging left edge: move start, keep end fixed
              const endCol = sketchSelectedNote.dragStartCol + sketchSelectedNote.dragStartLength - 1
              const newStartCol = Math.max(0, Math.min(col, endCol - 1))
              sketchSelectedNote.note = applyResizeToNote(sketchSelectedNote.note, newStartCol, endCol)
            } else {
              // Dragging right edge: keep start fixed, extend/shrink end
              const newEndCol = Math.max(startCol, Math.min(col, maxCol))
              sketchSelectedNote.note = applyResizeToNote(sketchSelectedNote.note, startCol, newEndCol)
            }
            // No setState — selectedNoteRef.current is the same object, mutation is visible next frame
            return
          }

          if (activeDraggedNote) {
            updateActiveDragDraft(p.mouseX, p.mouseY)
            return
          }

          if (pendingLongPressDrag) {
            const deltaX = p.mouseX - pendingLongPressDrag.pressX
            const deltaY = p.mouseY - pendingLongPressDrag.pressY
            const movedDistance = Math.hypot(deltaX, deltaY)

            if (movedDistance > LONG_PRESS_MOVE_TOLERANCE_PX) {
              clearLongPressTimer()
              tapDetectionRef.current = null // Cancel tap detection if we move too far
              pendingLongPressDrag = null
            }
            return
          }

          if (!drawGesture) return

          // Horizontal drag extends or shrinks duration one grid column at a time.
          const { col } = clampPointerToGrid(p.mouseX, p.mouseY)
          drawGesture.currentCol = col
          return
        }

        if (isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)) {
          currentStroke.push([p.mouseX, p.mouseY])
        }
      }

      //Remove note on double click
      p.doubleClicked = () => {
        const clickedNote = getNoteAtPosition(p.mouseX, p.mouseY)
        if (clickedNote) {
          historyRef.current.push([...compositionTemp]) // Save previous state for undo
          compositionTemp = compositionTemp.filter((note) => note !== clickedNote)
          setComposition(compositionTemp)
          // Clear selection if the deleted note was the selected one
          if (sketchSelectedNote && sketchSelectedNote.originalNote === clickedNote) {
            sketchSelectedNote = null
            selectedNoteRef.current = null
          }
          setLastCompositionUpdateTime(Date.now())
        }
      }

      /**
       * Process completed stroke
       */
      p.mouseReleased = () => {
        if (drawStateRef.current) {
          // Handle released — just stop dragging; commit happens when selection is exited.
          if (sketchSelectedNote && sketchSelectedNote.isDraggingHandle) {
            sketchSelectedNote.isDraggingHandle = null
            sketchSelectedNote.dragStartLength = 0
            sketchSelectedNote.dragStartCol = 0
            // selectedNoteRef.current is the same object — mutations already reflected
            return
          }

          if (activeDraggedNote) {
            const releasedInside = isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)
            const compositionWithoutSource = compositionTemp.filter((note) => note !== activeDraggedNote?.sourceNote)

            if (releasedInside) {
              compositionTemp = applyNotesToComposition(compositionWithoutSource, [activeDraggedNote.draftNote])
            } else {
              // Releasing outside canvas permanently removes the dragged note.
              compositionTemp = compositionWithoutSource
            }


            setComposition(compositionTemp)
            setLastCompositionUpdateTime(Date.now())
            const samePositionAsSource = activeDraggedNote.sourceNote.startTime === activeDraggedNote.draftNote.startTime &&
              activeDraggedNote.sourceNote.pitch === activeDraggedNote.draftNote.pitch
            if (!samePositionAsSource) {
              historyRef.current.push([...compositionTemp])
            }
            drawGesture = null
            clearDragAndDropState()
            return
          }

          if (pendingLongPressDrag) {
            // Check if this was a single tap (press + release without significant movement)
            if (tapDetectionRef.current) {
              const deltaX = p.mouseX - tapDetectionRef.current.x
              const deltaY = p.mouseY - tapDetectionRef.current.y
              const movedDistance = Math.hypot(deltaX, deltaY)

              // Single tap: enter selection mode (only if playback is paused or at 0)
              if (movedDistance < LONG_PRESS_MOVE_TOLERANCE_PX) { //&& (playbackStateRef.current === 0 || !playbackStateRef.current)) {
                const sourceNote = pendingLongPressDrag.sourceNote
                sketchSelectedNote = {
                  note: new Note(sourceNote.pitch, sourceNote.startTime, sourceNote.duration),
                  originalNote: sourceNote, // reference identity into compositionTemp
                  isDraggingHandle: null,
                  dragStartLength: 0,
                  dragStartCol: 0,
                }
                selectedNoteRef.current = sketchSelectedNote
                tapDetectionRef.current = null
                drawGesture = null
                clearDragAndDropState()
                return
              }
            }

            // Short press on an existing note intentionally does nothing.
            drawGesture = null
            clearDragAndDropState()
            tapDetectionRef.current = null
            return
          }

          if (!drawGesture) return

          const releasedInside = isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)

          if (releasedInside) {
            // Each draw gesture commits exactly one quantized note.
            const note = gridSpanToNote(drawGesture.anchorCol, drawGesture.currentCol, drawGesture.row)
            compositionTemp = applyNotesToComposition(compositionTemp, [note])
            setComposition(compositionTemp)
            historyRef.current.push([...compositionTemp]) // Save state for undo
            setLastCompositionUpdateTime(Date.now()) // Update the last composition update time to help determine if it was performed while atempting to snap/unsnap the device.
          }

          drawGesture = null
          return
        }

        if (isInsideRelativeElementPosition(p.mouseX, p.mouseY, p.width, p.height)) {
          currentStroke.push([p.mouseX, p.mouseY])
        }

        if (currentStroke.length > 0) {
          eraseArr.push(currentStroke)
        }

        currentStroke = []
      }

      const touchAwareP5 = p as P5Instance & {
        touchStarted?: () => boolean
        touchMoved?: () => boolean
        touchEnded?: () => boolean
      }

      touchAwareP5.touchStarted = () => {
        p.mousePressed()
        return false
      }

      touchAwareP5.touchMoved = () => {
        p.mouseDragged()
        return false
      }

      touchAwareP5.touchEnded = () => {
        p.mouseReleased()
        return false
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
      }, 300); // wait for 300ms to prevent a performance drop
    });

    resizeObserver.observe(containerRef.current)

    // Cleanup on unmount
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      if (dragOverlayEnterTimerRef.current) {
        clearTimeout(dragOverlayEnterTimerRef.current)
        dragOverlayEnterTimerRef.current = null
      }
      setDragOverlay((prev) => (prev.visible ? { ...prev, visible: false, isEntering: false } : prev))
      selectedNoteRef.current = null
      tapDetectionRef.current = null
      resizeObserver.disconnect()
      if (p5Ref.current) {
        p5Ref.current.remove()
        p5Ref.current = null
      }
    }
  }, [progressRef, setComposition, setUndo])


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
      <style>
        {DRAG_OVERLAY_ENTER_PULSE_KEYFRAMES}
      </style>

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
        {CHROMATIC_NOTES.map((note, index) => (
          <NoteLabelCell
            key={note}
            note={note}
            octave={octave}
            index={index}
            totalNotes={CHROMATIC_NOTES.length}
            accentColor={activeTheme.hex}
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
      >
        {dragOverlay.visible && (
          <div
            style={{
              position: 'absolute',
              left: `${dragOverlay.x}px`,
              top: `${dragOverlay.y}px`,
              width: `${dragOverlay.width}px`,
              height: `${dragOverlay.height}px`,
              pointerEvents: 'none',
              zIndex: 10,
              background: `rgba(${activeTheme.noteFill[0]}, ${activeTheme.noteFill[1]}, ${activeTheme.noteFill[2]}, 0.92)`,
              border: `2px solid rgb(${activeTheme.noteStroke.join(', ')})`,
              boxShadow: '0 8px 18px rgba(0, 0, 0, 0.32)',
              borderRadius: '2px',
              boxSizing: 'border-box',
              transform: 'scale(1)',
              transformOrigin: 'center',
              animation: dragOverlay.isEntering ? 'dragOverlayEnterPulse 220ms ease-out' : 'none',
              willChange: 'transform',
            }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * NoteLabelCell - Individual note label in sidebar
 */
function NoteLabelCell({ note, octave, index, totalNotes, accentColor }: NoteLabelCellProps) {
  const isSharp = note.includes('#')

  return (
    <div
      style={{
        flex: 1,
        borderBottom: index < totalNotes - 1 ? `1px solid ${accentColor}` : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '10px',
        background: isSharp ? '#111111' : '#ffffff',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          color: isSharp ? '#ffffff' : accentColor,
          fontWeight: isSharp ? 700 : 400,
          fontFamily: 'monospace',
        }}
      >
        {note}{octave}
      </span>
    </div>
  )
}