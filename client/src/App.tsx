import { useEffect, useRef, useState } from 'react'
import { TopBar } from './components/topbar/TopBar'
import { NoteSpace } from './components/notespace/NoteSpace'
import { DrumSpace } from './components/notespace/DrumSpace'
import { ControlPanel } from './components/ControlPanel'
import * as ctx from './contexts/snaptunestatecontext'
import { ServerSocketService } from 'simsnap-core'
import './App.css'
import { GRID_COLS, Instrument, MusicGroupStatePayload, Note } from './types'
import * as Tone from 'tone';
import { MovementManagerDeviceEvent } from 'simsnap-core/src/entities/VirtualRoom/MovementManager'


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
  const { drumsComposition } = ctx.useDrumsComposition()
  const { octave } = ctx.useOctave()
  const { requestClear } = ctx.useUpdateClear();

  // const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const instrumentRef = useRef<Instrument | null>(instrument)
  

  const [snapBorders, setSnapBorders] = useState<SnapBorder[]>([])
  const [musicGroupState, setMusicGroupState] = useState<MusicGroupStatePayload | null>(null)
  const [connectedToServer, setConnectedToServer] = useState<boolean>(false)
  const [volume, setVolume] = useState<number>(-20)
  const [permissionGranted, setPermissionGranted] = useState<Boolean>(false)

  useEffect(() => {
    instrumentRef.current = instrument
  }, [instrument])

  const requestDeviceMotionPermission = async () => {
        if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
            // iOS 13+ devices
            try {
                const permissionState = await (DeviceMotionEvent as any).requestPermission();
                setPermissionGranted(permissionState === 'granted');
                console.log(`Device motion permission: ${permissionState}`);
                return permissionState === 'granted';
            } catch (error) {
                console.error('Error requesting device motion permission:', error);
                return false;
            }
        } else {
            // Non-iOS devices (automatically granted)
            setPermissionGranted(true);
            console.log('Device motion permission: automatically granted');
            return true;
        }
    };

    // Device motion effect
    useEffect(() => {
        const handleDeviceAcceleration = (event: DeviceMotionEvent) => {
            if (!permissionGranted) return;

            const acceleration = event.acceleration;
            const x = acceleration?.x || 0;
            const y = acceleration?.y || 0;
            const z = acceleration?.z || 0;
            const timestamp: number = Date.now() as number;

            // Send individual acceleration data to server for shake detection
            // console.log(`📱 Sending deviceMotion:`, { x: x, y: y, z: z });
            ServerSocketService.emit('acceleration', { x,  y, z });
          };

        if (permissionGranted) {
            window.addEventListener('devicemotion', handleDeviceAcceleration);
            console.log('Device motion listener added');
        }

        return () => {
            window.removeEventListener('devicemotion', handleDeviceAcceleration);
        };
    }, [permissionGranted]);


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

    const syncConnectionState = (): void => {
      const socket = ServerSocketService.Connection
      setConnectedToServer(!!socket?.connected)
      if (!socket?.connected) {
        setSnapBorders([])
        setMusicGroupState(null)
      }
    }

    const onConnect = (): void => {
      console.log('Connected to SimSnap server');
      syncConnectionState()
      requestDeviceMotionPermission();
    }

    const onDisconnect = (reason: string): void => {
      console.log(`Disconnected from SimSnap server: ${reason}`)
      syncConnectionState()
    }

    const onConnectError = (error: Error): void => {
      console.log(`Connection error: ${error.message}`)
      syncConnectionState()
    }

    const onReconnectAttempt = (): void => {
      syncConnectionState()
    }

    const onReconnect = (): void => {
      syncConnectionState()
    }

    const onReconnectError = (): void => {
      syncConnectionState()
    }

    const onReconnectFailed = (): void => {
      syncConnectionState()
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


    const onShake = (data: MovementManagerDeviceEvent): void => {
      console.log(`🫨 Shake event received from device ${data.device.id.value}`);
      const activeInstrument = instrumentRef.current
      // Emit a targeted clear event for the currently active instrument family.
      requestClear(activeInstrument === Instrument.Drums ? 'drums' : 'melodic');
    }

    const onMusicGroupState = (payload: MusicGroupStatePayload): void => {
      setMusicGroupState(payload)
    }

    const onConnectedToServer = (isConnected: boolean): void => {
      setConnectedToServer(isConnected && ServerSocketService.Connection.connected)
      if (!isConnected || !ServerSocketService.Connection.connected) {
        setSnapBorders([])
        setMusicGroupState(null)
      }
    }



    ServerSocketService.Connection.on('connect', onConnect)
    ServerSocketService.Connection.on('disconnect', onDisconnect)
    ServerSocketService.Connection.on('connect_error', onConnectError)
    ServerSocketService.Connection.io.on('reconnect_attempt', onReconnectAttempt)
    ServerSocketService.Connection.io.on('reconnect', onReconnect)
    ServerSocketService.Connection.io.on('reconnect_error', onReconnectError)
    ServerSocketService.Connection.io.on('reconnect_failed', onReconnectFailed)
    ServerSocketService.Connection.on('clientSize', onClientSize)
    ServerSocketService.Connection.on('snapBorder', onSnapBorder)
    ServerSocketService.Connection.on('unSnapBorder', onUnsnapBorder)
    ServerSocketService.Connection.on('shake', onShake)
    ServerSocketService.Connection.on('musicGroupState', onMusicGroupState)
    ServerSocketService.Connection.on('connectedToServer', onConnectedToServer)

    syncConnectionState()


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
      ServerSocketService.Connection.off('disconnect', onDisconnect)
      ServerSocketService.Connection.off('connect_error', onConnectError)
      ServerSocketService.Connection.io.off('reconnect_attempt', onReconnectAttempt)
      ServerSocketService.Connection.io.off('reconnect', onReconnect)
      ServerSocketService.Connection.io.off('reconnect_error', onReconnectError)
      ServerSocketService.Connection.io.off('reconnect_failed', onReconnectFailed)
      ServerSocketService.Connection.off('clientSize', onClientSize)
      ServerSocketService.Connection.off('musicGroupState', onMusicGroupState)
      ServerSocketService.Connection.off('connectedToServer', onConnectedToServer)
      ServerSocketService.emit('destroy', undefined);
      containerRef.current!.onpointerdown = null;
      containerRef.current!.onpointermove = null;
      containerRef.current!.onpointerup = null;
    }
  }, [])

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

    // Bells samples
    samplersRef.current.bells = new Tone.Sampler({
      urls: {
        A3: "bells_A3.wav",
        B3: "bells_B3.wav",
        C3: "bells_C3.wav",
        D3: "bells_D3.wav",
        E3: "bells_E3.wav",
        F3: "bells_F3.wav",
        G3: "bells_G3.wav"
      },
      baseUrl: "audio/bells/",
      onload: () => setLoadedInstruments(prev => ({ ...prev, [Instrument.Bells]: true }))
    }).toDestination();

    samplersRef.current[Instrument.Drums] = new Tone.Sampler({
      urls: {
        B3: "kick.wav",
        A3: "snare.wav",
        G3: "hihat.wav",
        F3: "clap.wav"
      },
      baseUrl: "audio/drums/",
      onload: () => setLoadedInstruments(prev => ({ ...prev, [Instrument.Drums]: true }))
    }).toDestination();

    // Clean up when unmount
    return () => {
      Object.values(samplersRef.current).forEach(sampler => sampler?.dispose());
    };
  }, []);

  const constructComposition = async (totalDuration: number) => {
    Tone.getTransport().cancel();
    console.log("current instrument" + instrument);
    const compositionSelected: Note[] = instrument === Instrument.Drums ? drumsComposition : composition
    compositionSelected.forEach((note: Note) => {
      const startTimeSec = note.startTime * totalDuration;

      const durationSec = note.duration * totalDuration;
      console.log(note.pitch+": start ="+startTimeSec+", duration ="+durationSec)

      Tone.getTransport().schedule((time) => {
        const currentSampler = samplersRef.current[instrument!];
        if (currentSampler) {
          if (instrument === Instrument.Drums) {
            currentSampler.triggerAttackRelease(note.pitch + '3', durationSec, time);
          } else {
            currentSampler.triggerAttackRelease(note.pitch + octave.toString(), durationSec, time);
          }

        }

      }, startTimeSec);
    });
  }


  useEffect(() => {
    // 1 bar(measure) = 4 beats 
    // for a 4/4 signature (Common Time)
    const totalDurationSec = (GRID_COLS / bpm) * 60; // The composition is 16 beats long (4 bar)
    //Example: at a BPM of 60 it gives 4s because for 
    const totalMs = totalDurationSec * 1000;

    //Handle volume (0 = current decibel level of the device)
    if (volume <= -40) {
      Tone.getDestination().mute = true;
    } else if (volume <= 0) {
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
            <TopBar volume={volume} setVolume={setVolume} />
            {instrument === Instrument.Drums ? <DrumSpace progressRef={progressRef} /> : <NoteSpace progressRef={progressRef} />}
            <ControlPanel />
          </ctx.SFXContextProvider>
        </ctx.UndoContextProvider>
      </ctx.DrawStateContextProvider>

      {connectedToServer && snapBorders.map((border) => (
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

      <div
        style={{
          position: 'absolute',
          right: '8px',
          top: '5px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#ffffff',
          fontSize: '11px',
          lineHeight: 1.25,
          fontFamily: 'monospace',
          borderRadius: '4px',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '999px',
            backgroundColor: connectedToServer ? '#35d071' : '#e45050',
            display: 'inline-block',
          }}
        />
        server: {connectedToServer ? 'connected' : 'disconnected'}
      </div>

      {(() => {
        const selfDeviceId = musicGroupState?.selfDeviceId
        const selfState = selfDeviceId ? musicGroupState?.devices[selfDeviceId] : undefined
        const groupLabel = selfState?.groupId ?? 'none'
        const positionLabel = selfState?.position ? `[col: ${selfState.position.col}, row: ${selfState.position.row}]` : 'n/a'

        return (
          <div
            style={{
              position: 'absolute',
              left: '8px',
              top: '8px',
              padding: '6px 8px',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: '#ffffff',
              fontSize: '11px',
              lineHeight: 1.25,
              fontFamily: 'monospace',
              borderRadius: '4px',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            group: {groupLabel}<br />
            pos: {positionLabel}
          </div>
        )
      })()}
    </div>
  )
}

export default App