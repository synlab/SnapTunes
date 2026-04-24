import { useEffect, useRef } from 'react'
import * as ctx from '../../contexts/snaptunestatecontext'
import p5 from 'p5'

const WHITE_NOTES = ['B', 'A', 'G', 'F', 'E', 'D', 'C']
const HAS_SHARP_BELOW = { B: true, A: true, G: true, F: false, E: true, D: true, C: false }

export function NoteSpace({ progressRef }) {
  //--- Context Variable Init ---//
  const { playback } = ctx.usePlayback()
  const { drawState } = ctx.useDrawState()
  const { setDrawState } = ctx.useUpdateDrawState()

  const { instrument } = ctx.useInstrument()

  const { clear } = ctx.useClear()
  const { setClear } = ctx.useUpdateClear()

  const { undo } = ctx.useUndo()
  const { setUndo } = ctx.useUpdateUndo()

  const containerRef = useRef(null)
  const p5Ref = useRef(null)

  // These refs let the p5 sketch see the latest context values
  // without needing to remount the sketch when they change
  const clearRef = useRef(clear)
  const undoRef = useRef(undo)
  const drawStateRef = useRef(drawState)

  useEffect(() => { clearRef.current = clear }, [clear])
  useEffect(() => { undoRef.current = undo }, [undo])
  useEffect(() => { drawStateRef.current = drawState }, [drawState])

  useEffect(() => {
    const sketch = (p) => {
      //Stroke
      let melodyArr = [] // Stores every single stroke on the NoteSpace
      //Erase (VISUALS ONLY)
      let eraseArr = []

      let currStroke = [] //Stores the stroke being drawn NOW

      p.setup = () => {
        const w = containerRef.current.offsetWidth
        const h = containerRef.current.offsetHeight
        const canvas = p.createCanvas(w, h)
        canvas.parent(containerRef.current)
        p.background(255, 255, 255)
      }

      function drawSeekbar() {
        if (!progressRef?.current && progressRef?.current !== 0) return
        const x = progressRef.current * p.width
        const colW = p.width / (8 * 2) // width of one eighth-note column

        p.noStroke()
        p.fill(76, 102, 207, 40) // same blue as strokes, semi-transparent
        p.rect(x - colW / 2, 0, colW, p.height)
      }

      function drawGrid() {
        const rowH = p.height / WHITE_NOTES.length
        for (let i = 0; i < WHITE_NOTES.length; i++) {
          const y = i * rowH
          p.noStroke()
          p.fill(255, 255, 255)
          p.rect(0, y, p.width, rowH)
          p.stroke(0, 0, 0, 60)
          p.strokeWeight(0.5)
          p.line(0, y, p.width, y)
        }
        p.stroke(0, 0, 0, 80)
        p.strokeWeight(1)
        p.line(p.width / 2, 0, p.width / 2, p.height)
        const cols = 8
        for (let i = 1; i < cols; i++) {
          if (i === cols / 2) continue
          const x = (p.width / cols) * i
          p.stroke(0, 0, 0, i % 2 === 0 ? 255 : 100)
          p.strokeWeight(0.5)
          p.line(x, 0, x, p.height)
        }
      }

      function drawEraseStroke(){
        if (currStroke.length < 1) return
        for (let i = 1; i < currStroke.length; i++) {
          p.stroke(255, 255, 255)
          p.strokeWeight(20.0)
          p.line(currStroke[i-1][0], currStroke[i-1][1], currStroke[i][0], currStroke[i][1])
        }
      }

      function drawErase(){
        if (eraseArr.length < 1) return
        for (let i = 0; i < eraseArr.length; i++) {
          for (let j = 1; j < eraseArr[i].length; j++) {
            p.stroke(255, 255, 255)
            p.strokeWeight(20.0)
            p.line(
              eraseArr[i][j-1][0], eraseArr[i][j-1][1],
              eraseArr[i][j][0],   eraseArr[i][j][1]
            )
          }
        }
      }

      function drawStroke() {
        if (currStroke.length < 1) return
        for (let i = 1; i < currStroke.length; i++) {
          p.stroke(76, 102, 207) //Colour of stroke (plz change)
          p.strokeWeight(20.0)
          p.line(currStroke[i-1][0], currStroke[i-1][1], currStroke[i][0], currStroke[i][1])
        }
      }

      function drawMelody() {
        if (melodyArr.length < 1) return
        for (let i = 0; i < melodyArr.length; i++) {
          for (let j = 1; j < melodyArr[i].length; j++) {
            p.stroke(76, 102, 207)
            p.strokeWeight(20.0)
            p.line(
              melodyArr[i][j-1][0], melodyArr[i][j-1][1],
              melodyArr[i][j][0],   melodyArr[i][j][1]
            )
          }
        }
      }

      p.draw = () => {
        // Read refs on every frame — always reflects latest context values
        if (clearRef.current) {
          melodyArr = []
          currStroke = []
          setClear(false)
        }

        if (undoRef.current) {
          melodyArr.pop()
          setUndo(false)
        }

        p.clear()
        p.background(255, 255, 255)
        drawGrid()
        drawSeekbar()
        drawErase()
        drawMelody()
        if(drawState) drawStroke()
        else drawEraseStroke()
      }

      p.mouseDragged = () => {
        currStroke.push([p.mouseX, p.mouseY]) //While mouse is dragged, add points to currStroke
      }

      p.mouseReleased = () => {
        if (currStroke.length > 0) {
          if(drawState){
            melodyArr.push(currStroke)
          }
          else{
            eraseArr.push(currStroke)
          }
        } //A stroke is done; add it to the overall melody
        currStroke = [] //Reset currStroke
      }
    }

    p5Ref.current = new p5(sketch)
    return () => p5Ref.current?.remove()
  }, [])

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
      <div style={{
        position: 'relative',
        width: '100px',
        flexShrink: 0,
        background: '#ffffff',
        borderRight: '2px solid #000000',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {WHITE_NOTES.map((note, i) => (
          <div key={note} style={{
            position: 'relative',
            flex: 1,
            borderBottom: i < WHITE_NOTES.length - 1 ? '1px solid #2a2a3a' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '6px',
          }}>
            <div style={{
              position: 'absolute',
              right: 0, top: '12%', bottom: '12%',
              width: '46px',
              background: '#fff',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: '10px',
            }}>
              <span style={{ fontSize: '12px', color: '#000000', fontWeight: 'normal', fontFamily: 'monospace' }}>
                {note}
              </span>
            </div>
            {HAS_SHARP_BELOW[note] && i < WHITE_NOTES.length - 1 && (
              <div style={{
                position: 'absolute',
                bottom: '-18%', right: '0px',
                width: '60px', height: '36%',
                background: '#000',
                zIndex: 2,
              }} />
            )}
          </div>
        ))}
      </div>
      <div ref={containerRef} style={{ flex: 1, position: 'relative', cursor: 'crosshair' }} />
    </div>
  )
}