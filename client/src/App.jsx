import { useEffect, useRef } from 'react'
import { TopBar } from './components/topbar/TopBar'
import { NoteSpace } from './components/notespace/NoteSpace'
import { DrumSpace } from './components/notespace/DrumSpace'
import { ControlPanel } from './components/ControlPanel'
import * as ctx from './contexts/snaptunestatecontext'
import { VirtualRoom, ServerSocketService } from 'simsnap-core'
import './App.css'

function App() {
  const { instrument } = ctx.useInstrument()
  const { playback } = ctx.usePlayback()
  const { setPlayback } = ctx.useUpdatePlayback()
  const { bpm } = ctx.useBPM()

  const progressRef = useRef(0)
  const animFrameRef = useRef(null)
  const startTimeRef = useRef(null)

  // Two measures at the current BPM
  // One measure = 4 beats, so two measures = 8 beats
  const getTotalMs = () => (8 / (bpm / 60)) * 1000


  useEffect(() => {

    // Initialize connection
ServerSocketService.InitConnection(
  'ROOM_SHARED',           // room code
  window.location.hostname,         // server IP
  4000,               // server port
  window.innerWidth,   // client screen width
  window.innerHeight,  // client screen height
  true               // use HTTP (true for HTTPS)
);

// Listen for connection events
ServerSocketService.addEventListener('connect', () => {
  console.log('Connected to SimSnap server');
});

ServerSocketService.addEventListener('clientSize', (event) => {
  console.log('📐 Screen size sent:', event.width, 'x', event.height);
});

// Handle disconnection
window.addEventListener('beforeunload', () => {
  ServerSocketService.emit('destroy', undefined);
});

    if (playback === 1) {
      startTimeRef.current = performance.now() - progressRef.current * getTotalMs()

      const tick = (now) => {
        const elapsed = now - startTimeRef.current
        const total = getTotalMs()
        const progress = elapsed / total

        if (progress >= 1) {
          progressRef.current = 0
          setPlayback('stop')
          return
        }

        progressRef.current = progress
        animFrameRef.current = requestAnimationFrame(tick)
      }

      animFrameRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(animFrameRef.current)
      if (playback === 0) progressRef.current = 0
    }

    return () => cancelAnimationFrame(animFrameRef.current)
  }, [playback])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '1fr 9fr 2fr',
        gridGap: '0.5rem',
        width: '100vw',
        height: '100vh',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: '20px'
      }}
    >
      <ctx.DrawStateContextProvider>
        <ctx.UndoContextProvider>
          <ctx.SFXContextProvider>
            <TopBar />
            {instrument === 3 ? <DrumSpace progressRef={progressRef} /> : <NoteSpace progressRef={progressRef} />}
            <ControlPanel />
          </ctx.SFXContextProvider>
        </ctx.UndoContextProvider>
      </ctx.DrawStateContextProvider>
    </div>
  )
}

export default App
