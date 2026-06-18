import { useEffect, useRef, useState } from 'react'
import { TopBar } from './components/topbar/TopBar'
import { NoteSpace } from './components/notespace/NoteSpace'
import { DrumSpace } from './components/notespace/DrumSpace'
import { ControlPanel } from './components/ControlPanel'
import * as ctx from './contexts/snaptunestatecontext'
import { ServerSocketService } from 'simsnap-core'
import './App.css'

interface SnapBorder {
  id: string
  x: string
  y: string
  width: string
  height: string
  color: string
  position: string
}

function App() {
  const { instrument } = ctx.useInstrument()
  const { playback } = ctx.usePlayback()
  const { setPlayback } = ctx.useUpdatePlayback()
  const { bpm } = ctx.useBPM()

  // const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [snapBorders, setSnapBorders] = useState<SnapBorder[]>([])

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    console.log(`🔌 Connecting through Vite proxy to backend`);

    ServerSocketService.InitConnection(
      '',
      window.location.hostname,
      4000,
      container.clientWidth,
      container.clientHeight,
      true
    )

    const onConnect = (): void => {
      console.log('Connected to SimSnap server')
    }

    const onClientSize = (event: { width: number; height: number }): void => {
      console.log('📐 Screen size sent:', event.width, 'x', event.height)
    }

    const onSnapBorder = (snapedDeviceId: string, position: string, color: string): void => {
      console.log(
        `🔗 Snap border received: device=${snapedDeviceId}, position=${position}, color=${color}`
      )

      const isVerticalBorder = ['left', 'right'].includes(position)
      const strokeWidth = '5px'
      const isCurrentlyFullscreen = !!document.fullscreenElement

      setSnapBorders((prev) => [
        ...prev.filter((border) => border.id !== snapedDeviceId),
        {
          id: snapedDeviceId,
          x: isVerticalBorder ? (position === 'left' ? '0px' : `calc(100% - ${strokeWidth})`) : strokeWidth,
          y: isVerticalBorder ? '0px' : position === 'top' ? '0px' : `calc(100% - ${strokeWidth})`,
          width: isVerticalBorder ? strokeWidth : '100%',
          height: isVerticalBorder && isCurrentlyFullscreen ? '100%' : isVerticalBorder ? '100%' : strokeWidth,
          color,
          position,
        },
      ])
    }

    const onUnsnapBorder = (snapedDeviceId: string): void => {
      console.log(`💔 Unsnap border received: device=${snapedDeviceId}`)
      setSnapBorders((prev) => prev.filter((border) => border.id !== snapedDeviceId))
    }

    ServerSocketService.Connection.on('connect', onConnect)
    ServerSocketService.Connection.on('clientSize', onClientSize)
    ServerSocketService.Connection.on('snapBorder', onSnapBorder)
    ServerSocketService.Connection.on('unSnapBorder', onUnsnapBorder)

    const onPointerPress = (event: PointerEvent): void => {
      console.log(`👆 Pointer press: (${event.clientX}, ${event.clientY})`)
      ServerSocketService.emit('pointerPress', { x: event.clientX, y: event.clientY })
    }

    const onPointerMove = (event: PointerEvent): void => {
      ServerSocketService.emit('pointerMove', { x: event.clientX, y: event.clientY })
    }

    const onPointerUp = (event: PointerEvent): void => {
      console.log(`👆 Pointer release: (${event.clientX}, ${event.clientY})`)
      ServerSocketService.emit('pointerRelease', { x: event.clientX, y: event.clientY })
    } 

    //Intercept native pointer event
    containerRef.current!.onpointerdown = onPointerPress
    containerRef.current!.onpointermove = onPointerMove
    containerRef.current!.onpointerup = onPointerUp

    const handleBeforeUnload = () => {
      ServerSocketService.emit('destroy', undefined);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      ServerSocketService.Connection.off('snapBorder', onSnapBorder)
      ServerSocketService.Connection.off('unSnapBorder', onUnsnapBorder)
      ServerSocketService.Connection.off('connect', onConnect)
      ServerSocketService.Connection.off('clientSize', onClientSize)
      ServerSocketService.emit('destroy', undefined);
      containerRef.current!.onpointerdown = null;
      containerRef.current!.onpointermove = null;
      containerRef.current!.onpointerup = null;
    }
  }, [''])

  useEffect(() => {
    const totalMs = (8 / (bpm / 60)) * 1000

    if (playback === 1) {
      startTimeRef.current = performance.now() - progressRef.current * totalMs

      const tick = (now: number): void => {
        const startTime = startTimeRef.current
        if (startTime === null) return

        const elapsed = now - startTime
        const progress = elapsed / totalMs

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
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }

      if (playback === 0) progressRef.current = 0
    }

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [playback, bpm, setPlayback])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'grid',
        gridTemplateRows: '1fr 9fr 2fr',
        gridGap: '0.5rem',
        width: '100vw',
        height: '100vh',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: '20px',
        //This instructs the browser to disable native scrolling and zooming,
        //preventing it from overriding the Pointer Events
        touchAction: 'none',
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

      {snapBorders.map((border) => (
        <div
          key={border.id}
          style={{
            position: 'absolute',
            left: border.x,
            top: border.y,
            width: border.width,
            height: border.height,
            backgroundColor: border.color,
          }}
        />
      ))}
    </div>
  )
}

export default App