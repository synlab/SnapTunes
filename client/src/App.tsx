import { useEffect, useRef, useState } from 'react'
import { TopBar } from './components/topbar/TopBar'
import { NoteSpace } from './components/notespace/NoteSpace'
import { DrumSpace } from './components/notespace/DrumSpace'
import { ControlPanel } from './components/ControlPanel'
import * as ctx from './contexts/snaptunestatecontext'
import { ServerSocketService } from 'simsnap-core'
import './App.css'
import { Instrument, Note } from './types'
import * as Tone from 'tone';


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
  const { composition } = ctx.useComposition()
  const { octave } = ctx.useOctave()

  // const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [snapBorders, setSnapBorders] = useState<SnapBorder[]>([])
  const [volume, setVolume] = useState<number>(-20)

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

  const [loadedInstruments, setLoadedInstruments] = useState<Record<Instrument, boolean>>({
    [Instrument.Piano]: false,
    [Instrument.Guitar]: false,
    [Instrument.Bells]: false,
    [Instrument.Drums]: false
  });
  // References to stock instances of Tone.Sampler whitout triggering re-renders
  const samplersRef = useRef<Record<Instrument, Tone.Sampler | null>>({
    [Instrument.Piano]: null,
    [Instrument.Guitar]: null,
    [Instrument.Bells]: null,
    [Instrument.Drums]: null,
  });


  // Inital instruments loading
  useEffect(() => {

    // Piano samples
    samplersRef.current.piano = new Tone.Sampler({
      urls: {
        A3: "Piano_A3.mp3",
        B3: "Piano_B3.mp3",
        C3: "Piano_C3.mp3",
        D3: "Piano_D3.mp3",
        E3: "Piano_E3.mp3",
        F3: "Piano_F3.mp3",
        G3: "Piano_G3.mp3"
      },
      baseUrl: "audio/piano/",
      onload: () => setLoadedInstruments(prev => ({ ...prev, [Instrument.Piano]: true }))
    }).toDestination();

    // Guitar samples
    samplersRef.current.guitar = new Tone.Sampler({
      urls: {
        A3: "guitar_A3.wav",
        B3: "guitar_B3.wav",
        C3: "guitar_C3.wav",
        D3: "guitar_D3.wav",
        E3: "guitar_E3.wav",
        F3: "guitar_F3.wav",
        G3: "guitar_G3.wav"
      },
      baseUrl: "audio/guitar/",
      onload: () => setLoadedInstruments(prev => ({ ...prev, [Instrument.Guitar]: true }))
    }).toDestination();

    // 3. Bells
    samplersRef.current.bells = new Tone.Sampler({
      urls: { 
        A3: "bells_A3.wav",
        B3: "bells_B3.wav",
        C3: "bells_C3.wav",
        D3: "bells_D3.wav",
        E3: "bells_E3.wav",
        F3: "bells_F3.wav",
        G3: "bells_G3.wav" },
      baseUrl: "audio/bells/",
      onload: () => setLoadedInstruments(prev => ({ ...prev, bells: true }))
    }).toDestination();

    // Clean up when unmount
    return () => {
      Object.values(samplersRef.current).forEach(sampler => sampler?.dispose());
    };
  }, []);

  const constructComposition = async (totalDuration: number) => {
    Tone.getTransport().cancel();
    console.log("current instrument" + instrument);
    composition.forEach((note: Note) => {
      const startTimeSec = note.startTime * totalDuration;
      const durationSec = note.duration * totalDuration;

      Tone.getTransport().schedule((time) => {
        const currentSampler = samplersRef.current[instrument!];
        if (currentSampler) {
          currentSampler.triggerAttackRelease(note.pitch + octave.toString(), durationSec, time);
        }

      }, startTimeSec);
    });
  }


  useEffect(() => {
    // 1 bar(measure) = 4 beats 
    // for a 4/4 signature (Common Time)
    const totalDurationSec = (16 / bpm) * 60; // The composition is 16 beats long (4 bar)
    //Example: at a BPM of 60 it gives 4s because for 
    const totalMs = totalDurationSec * 1000;

    //Handle volume (0 = current decibel level of the device)
    if(volume <= -40){
      Tone.getDestination().mute = true;
    }else if (volume <= 0){
      Tone.getDestination().mute = false;
      Tone.getDestination().volume.value = volume;
    } else { //Going above 0 dB is risky. It can harm your audio quality, your equipment, and your hearing
      Tone.getDestination().mute = true; //Safety silent mode
    }
    
    //Composition is playing
    if (playback === 1) {

      constructComposition(totalDurationSec);

      // Align the audio position with the visual position (when resuming after a pause)
      Tone.getTransport().seconds = progressRef.current * totalDurationSec;
      Tone.getTransport().start();

      startTimeRef.current = performance.now() - progressRef.current * totalMs

      const tick = (now: number): void => {
        const startTime = startTimeRef.current
        if (startTime === null) return

        const elapsed = now - startTime
        const progress = elapsed / totalMs

        //Does the progress bar has reached the end of composition ? (1 = absolute size of compostion) 
        if (progress >= 1) {
          progressRef.current = 0
          setPlayback('stop')
          return
        }

        //If not we continue to progress on composition
        progressRef.current = progress
        animFrameRef.current = requestAnimationFrame(tick)
      }
      
      animFrameRef.current = requestAnimationFrame(tick)
    } else {

      Tone.getTransport().pause();

      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }

      if (playback === 0 || playback == 'stop') {
        Tone.getTransport().stop();
        progressRef.current = 0
      }
    }

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [playback, bpm, setPlayback, volume])

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
            <TopBar volume={volume} setVolume={setVolume}/>
            {instrument === Instrument.Drums ? <DrumSpace progressRef={progressRef} /> : <NoteSpace progressRef={progressRef} />}
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