import { useEffect, useRef, useState } from 'react'
import { TopBar } from './components/topbar/TopBar'
import { NoteSpace } from './components/notespace/NoteSpace'
import { DrumSpace } from './components/notespace/DrumSpace'
import { ControlPanel } from './components/ControlPanel'
import * as ctx from './contexts/snaptunestatecontext'
import { ServerSocketService } from 'simsnap-core'
import './App.css'

function App() {

  const { instrument } = ctx.useInstrument()
  const { playback } = ctx.usePlayback()
  const { setPlayback } = ctx.useUpdatePlayback()
  const { bpm } = ctx.useBPM()
  const containerRef = useRef(null);

  const progressRef = useRef(0)
  const animFrameRef = useRef(null)
  const startTimeRef = useRef(null)

const [snapBorders, setSnapBorders] = useState([]);
const [isSnapped, setIsSnapped] = useState(false);

const [receivedEvent, setReceivedEvent] = useState([]);

  // Two measures at the current BPM
  // One measure = 4 beats, so two measures = 8 beats
  const getTotalMs = () => (8 / (bpm / 60)) * 1000


  useEffect(() => {

    const container = containerRef.current;
    if (!container) return;

    // Initialize connection once and keep the socket listeners stable.
    ServerSocketService.InitConnection(
      '',
      window.location.hostname,
      4000,
      container.clientWidth,
      container.clientHeight,
      true
    );

    const onConnect = () => {
      console.log('Connected to SimSnap server');
    };

    const onClientSize = (event) => {
      console.log('📐 Screen size sent:', event.width, 'x', event.height);
    };

    const onPointerPress = (event) => {
      console.log(`👆 Pointer press: (${event.clientX}, ${event.clientY})`);
      ServerSocketService.emit('pointerPress', { x: event.clientX, y: event.clientY });
    };

    const onPointerMove = (event) => {
      ServerSocketService.emit('pointerMove', { x: event.clientX, y: event.clientY });
    };

    const onPointerUp = (event) => {
      console.log(`👆 Pointer release: (${event.clientX}, ${event.clientY})`);
      ServerSocketService.emit('pointerRelease', { x: event.clientX, y: event.clientY });
    };

    const onSnapBorder = (snapedDeviceId, position, color) => {
      
      // setReceivedEvent([ServerSocketService.]);
      console.log(`🔗 Snap border received: device=${snapedDeviceId}, position=${position}, color=${color}`);
      const isVerticalBorder = ['left', 'right'].includes(position);
      const strokeWidth = '5px';
      const isCurrentlyFullscreen = !!document.fullscreenElement;

      setSnapBorders(prev => [...prev.filter(border => border.id !== snapedDeviceId), {
        id: snapedDeviceId,
        x: isVerticalBorder ? (position === 'left' ? '0px' : `calc(100% - ${strokeWidth})`) : `${strokeWidth}`,
        y: isVerticalBorder ? '0px' : (isVerticalBorder ? `${strokeWidth}px` : (position === 'top' ? '0px' : `calc(100% - ${strokeWidth})`)),
        width: isVerticalBorder ? strokeWidth : '100%',
        height: isVerticalBorder && isCurrentlyFullscreen ? '100%' : (isVerticalBorder ? '100%' : strokeWidth),
        color,
        position
      }]);
      setIsSnapped(true);
    };

    const onUnsnapBorder = (snapedDeviceId) => {

      console.log(`💔 Unsnap border received: device=${snapedDeviceId}`);
      setSnapBorders(prev => {
        const nextBorders = prev.filter(border => border.id !== snapedDeviceId);
        setIsSnapped(nextBorders.length > 0);
        return nextBorders;
      });
    };

    const onSnapDevices = (event) => {
      console.log('Devices snapped together!', event.event1.device.id.value +" et "+ event.event1.device.id.value);
    };

    ServerSocketService.addEventListener('connect', onConnect);
    ServerSocketService.addEventListener('clientSize', onClientSize);
    ServerSocketService.Connection.on('snapDevices', onSnapDevices);
    ServerSocketService.Connection.on('snapBorder', onSnapBorder);
    ServerSocketService.Connection.on('unSnapBorder', onUnsnapBorder);

    containerRef.current.onpointerdown = onPointerPress;
    containerRef.current.onpointermove = onPointerMove;
    containerRef.current.onpointerup = onPointerUp;

    const handleBeforeUnload = () => {
      ServerSocketService.emit('destroy', undefined);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      ServerSocketService.Connection.off('snapDevices', onSnapDevices);
      ServerSocketService.Connection.off('snapBorder', onSnapBorder);
      ServerSocketService.Connection.off('unSnapBorder', onUnsnapBorder);
      ServerSocketService.removeEventListener('connect', onConnect);
      ServerSocketService.removeEventListener('clientSize', onClientSize);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.onpointerdown = null;
      window.onpointermove = null;
      window.onpointerup = null;
    };
  }, []);

  useEffect(() => {
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
      {snapBorders.map(border => (
            <div key={border.id} style={{
                position: 'absolute',
                left: border.x,
                top: border.y,
                width: border.width,
                height: border.height,
                backgroundColor: border.color                
            }}></div>
        ))}
        {snapBorders.map((border, i) => (
            <div style={{ position: 'absolute', top: `${200+ i * 20}px`, left: '0', backgroundColor: 'white'}}>left: {border.x} top: {border.y},
                width: {border.width},
                height: {border.height},</div>

        ))}
        {receivedEvent.map((event, i) => (
            <div style={{ position: 'absolute', top: `${200+ i * 20}px`, left: '400px', backgroundColor: 'white'}}>event: {event}</div>

        ))}
      </div>
  )
}

export default App
