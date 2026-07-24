import { useEffect, useRef, useState } from 'react'
import { TopBar } from './components/topbar/TopBar'
import { NoteSpace } from './components/notespace/NoteSpace'
import { DrumSpace } from './components/notespace/DrumSpace'
import { SHOW_DEBUG_OVERLAY } from './app/debugHandler'
import { DebugOverlay } from './components/overlays/DebugOverlay'
import * as ctx from './contexts/snaptunestatecontext'
import * as simsnapctx from './contexts/simsnapcontext'
import { ServerSocketService } from 'simsnap-core'
import './App.css'
import {
  Instrument,
  MUSIC_GROUP_SHARED_BPM,
  MusicGroupCancelScheduledStartPayload,
  MusicGroupClockSyncRequest,
  MusicGroupClockSyncResponse,
  MusicGroupColumnFinishedPayload,
  MusicGroupColumnScheduledPayload,
  MusicGroupPauseCapturePayload,
  MusicGroupPauseReportPayload,
  MusicGroupPausedPayload,
  MusicGroupPlaybackCommand,
  MusicGroupResetPayload,
  MusicGroupStatePayload,
  Note,
} from './types'
import { generateRequestId, getCompositionDurationMs, getCompositionDurationSec } from './app/playbackUtils'
import { applyNotesToComposition } from './utils/noteProcessor'
import { useSamplerTransport } from './app/useSamplerTransport'
import * as Tone from 'tone';
import { MovementManagerDeviceEvent } from 'simsnap-core/src/entities/VirtualRoom/MovementManager'
import { type CompletedInteraction } from './app/services/TiltAnalyzerService'
import { OctaveChangeTiltAnalyzer } from './app/services/OctaveChangeTiltAnalyzer'
import { PourToCopyPasteTiltAnalyzer } from './app/services/PourToCopyPasteTiltAnalyzer'
import { OVERLAY_BASE_STYLE, OVERLAY_DEBUG_PANEL_STYLE, OVERLAY_MONOSPACE_TEXT_STYLE } from './components/overlays/overlayStyles'


//For visualizing snap borders between devices
interface SnapBorder {
  id: string
  x: string
  y: string
  width: string
  height: string
  color: string
  position: string
}

// For tracking the local device's group context for shared playback
interface SelfGroupContext {
  groupId: string | null
  columnIndex: number | null
  sharedBpm: number | null
}

// For tracking the currently active shared playback schedule, if any
interface ActiveGroupedSchedule {
  groupId: string
  columnIndex: number
  scheduleToken: number
  sharedBpm: number
}

// For tracking the local device's group context for shared playback
interface GroupPlaybackDebugSnapshot {
  groupId: string | null
  columnIndex: number | null
  scheduleToken: number | null
  serverClockOffsetMs: number
}

interface NoteTransferData {
  pitch: string
  startTime: number
  duration: number
}

interface PourInteractionEmitPayload {
  type: 'left' | 'right'
  startedAt: number
  compositionType: 'melodic' | 'drums'
  melodicComposition: NoteTransferData[]
  drumsComposition: NoteTransferData[]
}

interface PourTransferResolvedPayload {
  giverDeviceId: string
  receiverDeviceId: string
  directionFromGiver: 'left' | 'right'
  startedAt: number
  compositionType: 'melodic' | 'drums'
  incomingMelodicComposition: NoteTransferData[]
  incomingDrumsComposition: NoteTransferData[]
}


// Send a clock sync request every 5 seconds to keep the local clock offset estimate up to date
const CLOCK_SYNC_INTERVAL_MS = 5000

const soundOctaveUp = new Audio('/audio/feedback/OctaveChangeUp.wav');
const soundOctaveDown = new Audio('/audio/feedback/OctaveChangeDown.wav');

type GroupControlCommand = 'play' | 'pause' | 'stop'

function App() {
  // Context hooks for accessing and updating the global state
  const { instrument } = ctx.useInstrument()
  const { playback } = ctx.usePlayback()
  const { setPlayback } = ctx.useUpdatePlayback()
  const { setComposition } = ctx.useUpdateComposition()
  const { setDrumsComposition } = ctx.useUpdateDrumsComposition()
  const { bpm } = ctx.useBPM()
  const { composition } = ctx.useComposition()
  const { drumsComposition } = ctx.useDrumsComposition()
  const { octave } = ctx.useOctave()
  const { setOctave } = ctx.useUpdateOctave()
  const { requestClear } = ctx.useUpdateClear();

  // Context for tracking the last time a snap or unsnap event occurred, used to determine if an undo should be triggered after such events.
  const { setlastTimeSnapOrUnsnapContext } = simsnapctx.useUpdateLastTimeSnapOrUnsnapContext()

  // Refs for tracking individual state variables of a device without triggering re-renders. These are used for playback and group synchronization logic.
  const progressRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const instrumentRef = useRef<Instrument | null>(instrument)
  const compositionRef = useRef<Note[]>(composition)
  const drumsCompositionRef = useRef<Note[]>(drumsComposition)
  const octaveRef = useRef<number>(octave)


  soundOctaveDown.volume = Tone.getDestination().mute ? 0 : 0.1
  soundOctaveUp.volume = Tone.getDestination().mute ? 0 : 0.1

  // Refs for tracking the local device's group context and shared playback state
  const selfGroupContextRef = useRef<SelfGroupContext>({ groupId: null, columnIndex: null, sharedBpm: null })
  const serverClockOffsetMsRef = useRef<number>(0)
  const pendingClockRequestsRef = useRef<Map<string, number>>(new Map<string, number>())
  const clockSyncIntervalRef = useRef<number | null>(null)
  const bestClockSyncRttMsRef = useRef<number | null>(null)
  const pendingGroupedStartTimerRef = useRef<number | null>(null)
  const pendingGroupedStartTokenRef = useRef<number | null>(null)
  const activeGroupedScheduleRef = useRef<ActiveGroupedSchedule | null>(null)
  const selfDeviceIdRef = useRef<string | null>(null)
  const pastedFromDirectionTimerRef = useRef<number | null>(null)
  const hasSnappedNeighborRef = useRef<boolean>(false)


  const [snapBorders, setSnapBorders] = useState<SnapBorder[]>([])
  const [musicGroupState, setMusicGroupState] = useState<MusicGroupStatePayload | null>(null)
  const [connectedToServer, setConnectedToServer] = useState<boolean>(false)
  const [volume, setVolume] = useState<number>(-20)
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false)
  const [groupCommandPending, setGroupCommandPending] = useState<GroupControlCommand | null>(null)
  const [audioContextUnlocked, setAudioContextUnlocked] = useState<boolean>(false)
  const [groupPlaybackDebugSnapshot, setGroupPlaybackDebugSnapshot] = useState<GroupPlaybackDebugSnapshot>({
    groupId: null,
    columnIndex: null,
    scheduleToken: null,
    serverClockOffsetMs: 0,
  })
  const [tiltDebugSnapshot, setTiltDebugSnapshot] = useState<ReturnType<OctaveChangeTiltAnalyzer['getDebugSnapshot']> | null>(null)
  const [pourAttemptDirection, setPourAttemptDirection] = useState<'left' | 'right' | null>(null)
  const [pastedFromDirection, setPastedFromDirection] = useState<'left' | 'right' | null>(null)
  const octaveTiltAnalyzerRef = useRef<OctaveChangeTiltAnalyzer | null>(null)
  const pourToCopyTiltAnalyzerRef = useRef<PourToCopyPasteTiltAnalyzer | null>(null)
  const groupCommandTimeoutRef = useRef<number | null>(null)
  const groupCommandPendingRef = useRef<GroupControlCommand | null>(null)

  const { constructComposition } = useSamplerTransport({
    instrumentRef,
    compositionRef,
    drumsCompositionRef,
    octaveRef,
  })

  //Octave change tilt analyzer setup
  useEffect(() => {
    if (instrument === Instrument.Drums) return; // Skip setting up the octave tilt analyzer for drums

    octaveTiltAnalyzerRef.current = new OctaveChangeTiltAnalyzer((interaction: CompletedInteraction) => {
      if (interaction.type === 'octaveChangeUp' && octave < 8) {
        setOctave((prev) => prev + 1)
        soundOctaveUp.play();
      } else if (interaction.type === 'octaveChangeDown' && octave > 0) {
        setOctave((prev) => prev - 1)
        soundOctaveDown.play();
      }
    })

    return () => {
      octaveTiltAnalyzerRef.current = null
    }
  }, [instrument])

  //Pour to copy tilt analyzer setup
  useEffect(() => {
    const serializeNotes = (notes: Note[]): NoteTransferData[] => {
      return notes.map((note) => ({
        pitch: note.pitch,
        startTime: note.startTime,
        duration: note.duration,
      }))
    }

    const emitPourInteraction = (type: 'left' | 'right', startedAt: number): void => {
      const compositionType = instrumentRef.current === Instrument.Drums ? 'drums' : 'melodic'
      const payload: PourInteractionEmitPayload = {
        type,
        startedAt,
        compositionType,
        melodicComposition: compositionType === 'melodic' ? serializeNotes(compositionRef.current) : [],
        drumsComposition: compositionType === 'drums' ? serializeNotes(drumsCompositionRef.current) : [],
      }
      ServerSocketService.Connection.emit('pourInteraction', payload)
    }

    pourToCopyTiltAnalyzerRef.current = new PourToCopyPasteTiltAnalyzer((interaction: CompletedInteraction) => {
      if (interaction.type === 'pourLeft') {
        emitPourInteraction('left', interaction.startedAt)
      } else if (interaction.type === 'pourRight') {
        emitPourInteraction('right', interaction.startedAt)
      }
    })

    return () => {
      pourToCopyTiltAnalyzerRef.current = null
    }
  }, [])


  const selfDeviceId = musicGroupState?.selfDeviceId ?? null
  const selfDeviceState = selfDeviceId ? musicGroupState?.devices[selfDeviceId] : undefined
  const currentGroup = selfDeviceState?.groupId
    ? musicGroupState?.groups.find((group) => group.id === selfDeviceState.groupId) ?? null
    : null
  const isGrouped = !!selfDeviceState?.groupId && !!selfDeviceState.position && !!currentGroup
  const isSnappedWithAnotherDevice = Boolean(
    selfDeviceState?.groupId &&
    musicGroupState &&
    Object.entries(musicGroupState.devices).some(([deviceId, deviceState]) => (
      deviceId !== selfDeviceId && deviceState.groupId === selfDeviceState.groupId
    ))
  )
  const playbackBpm = currentGroup?.sharedBpm ?? bpm

  useEffect(() => {
    selfDeviceIdRef.current = selfDeviceId
  }, [selfDeviceId])

  useEffect(() => {
    hasSnappedNeighborRef.current = isSnappedWithAnotherDevice
    if (!isSnappedWithAnotherDevice) {
      setPourAttemptDirection(null)
      setPastedFromDirection(null)
      clearPastedFromDirectionTimer()
    }
  }, [isSnappedWithAnotherDevice])


  // Update refs whenever the corresponding context state variables change
  useEffect(() => {
    instrumentRef.current = instrument
  }, [instrument])

  useEffect(() => {
    compositionRef.current = composition
  }, [composition])

  useEffect(() => {
    drumsCompositionRef.current = drumsComposition
  }, [drumsComposition])

  useEffect(() => {
    octaveRef.current = octave
  }, [octave])

  // Update the group command pending ref whenever the state changes
  useEffect(() => {
    groupCommandPendingRef.current = groupCommandPending
  }, [groupCommandPending])

  useEffect(() => {
    selfGroupContextRef.current = {
      groupId: selfDeviceState?.groupId ?? null,
      columnIndex: selfDeviceState?.position?.col ?? null,
      sharedBpm: currentGroup?.sharedBpm ?? null,
    }
  }, [currentGroup, selfDeviceState])

  useEffect(() => {
    // Entering or leaving a group invalidates any local playback timeline. We
    // stop immediately so grouped playback can restart from the server-owned state.
    if (!musicGroupState) {
      return
    }

    clearPendingGroupedStart()
    stopTransportPlayback(true)
    clearGroupCommandPending()
    setPlayback(0)
  }, [musicGroupState, setPlayback])

  useEffect(() => {
    // Shared playback may be started by a server event instead of a direct click,
    // so we pre-warm Tone on the first user gesture to satisfy autoplay policies.
    const unlockOnGesture = (): void => {
      void ensureAudioContextRunning()
    }

    window.addEventListener('pointerdown', unlockOnGesture, { passive: true })
    window.addEventListener('keydown', unlockOnGesture)

    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture)
      window.removeEventListener('keydown', unlockOnGesture)
    }
  }, [])

  const cancelAnimationLoop = (): void => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
  }

  const clearPendingGroupedStart = (): void => {
    if (pendingGroupedStartTimerRef.current !== null) {
      window.clearTimeout(pendingGroupedStartTimerRef.current)
      pendingGroupedStartTimerRef.current = null
    }

    pendingGroupedStartTokenRef.current = null
  }

  const clearGroupCommandPending = (): void => {
    if (groupCommandTimeoutRef.current !== null) {
      window.clearTimeout(groupCommandTimeoutRef.current)
      groupCommandTimeoutRef.current = null
    }

    groupCommandPendingRef.current = null
    setGroupCommandPending(null)
  }

  const clearPastedFromDirectionTimer = (): void => {
    if (pastedFromDirectionTimerRef.current !== null) {
      window.clearTimeout(pastedFromDirectionTimerRef.current)
      pastedFromDirectionTimerRef.current = null
    }
  }

  const convertTransferredNotes = (notes: NoteTransferData[]): Note[] => {
    return notes.map((note) => new Note(note.pitch as Note['pitch'], note.startTime, note.duration))
  }

  const mergeIncomingTransferredCompositions = (payload: PourTransferResolvedPayload): void => {
    // Receiver only merges the composition family that participated in the transfer.
    if (payload.compositionType === 'melodic') {
      const incomingMelodic = convertTransferredNotes(payload.incomingMelodicComposition)
      // Incoming notes are applied last so they win in overlap conflicts.
      setComposition((previous) => applyNotesToComposition(previous, incomingMelodic))
      return
    }

    const incomingDrums = convertTransferredNotes(payload.incomingDrumsComposition)
    // Incoming notes are applied last so they win in overlap conflicts.
    setDrumsComposition((previous) => applyNotesToComposition(previous, incomingDrums))
  }

  const markGroupCommandPending = (command: GroupControlCommand): void => {
    clearGroupCommandPending()
    groupCommandPendingRef.current = command
    setGroupCommandPending(command)

    // Safety guard: never leave controls locked forever if an ack event is lost.
    groupCommandTimeoutRef.current = window.setTimeout(() => {
      console.warn(`Timed out waiting for shared ${command} acknowledgement`)
      clearGroupCommandPending()
    }, 5000)
  }

  const ensureAudioContextRunning = async (): Promise<boolean> => {
    try {
      await Tone.start()
      await Tone.getContext().rawContext.resume()
      const isRunning = Tone.getContext().state === 'running'
      setAudioContextUnlocked(isRunning)

      if (!isRunning) {
        console.warn('AudioContext is not running after resume attempt', {
          state: Tone.getContext().state,
        })
      }

      return isRunning
    } catch (error) {
      setAudioContextUnlocked(false)
      console.error('Failed to unlock AudioContext', error)
      return false
    }
  }

  const resetTransportForSharedPlayback = (): void => {
    // Shared playback must start from a clean transport state on every device.
    Tone.getTransport().stop()
    Tone.getTransport().position = 0
    Tone.getTransport().cancel()
  }

  const syncGroupPlaybackDebugSnapshot = (overrides: Partial<GroupPlaybackDebugSnapshot> = {}): void => {
    if (!SHOW_DEBUG_OVERLAY.group) {
      return
    }

    const currentSchedule = activeGroupedScheduleRef.current
    setGroupPlaybackDebugSnapshot({
      groupId: currentSchedule?.groupId ?? selfGroupContextRef.current.groupId,
      columnIndex: currentSchedule?.columnIndex ?? selfGroupContextRef.current.columnIndex,
      scheduleToken: currentSchedule?.scheduleToken ?? pendingGroupedStartTokenRef.current,
      serverClockOffsetMs: serverClockOffsetMsRef.current,
      ...overrides,
    })
  }

  const stopTransportPlayback = (resetCursor: boolean): void => {
    Tone.getTransport().pause()
    cancelAnimationLoop()

    if (resetCursor) {
      resetTransportForSharedPlayback()
      progressRef.current = 0
      startTimeRef.current = null
      activeGroupedScheduleRef.current = null
      syncGroupPlaybackDebugSnapshot({ scheduleToken: null, columnIndex: null })
    }
  }

  const runProgressLoop = (totalMs: number, onComplete: () => void): void => {
    const tick = (now: number): void => {
      const startTime = startTimeRef.current
      if (startTime === null) return

      const elapsed = now - startTime
      const progress = elapsed / totalMs

      if (progress >= 1) {
        progressRef.current = 1
        onComplete()
        return
      }

      progressRef.current = progress
      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }

  const startTransportPlayback = async (
    targetBpm: number,
    startProgress: number,
    onComplete: () => void
  ): Promise<void> => {
    const totalDurationSec = getCompositionDurationSec(targetBpm)
    const totalMs = totalDurationSec * 1000

    const isAudioReady = await ensureAudioContextRunning()
    if (!isAudioReady) {
      throw new Error('AudioContext is suspended; shared playback start aborted')
    }

    resetTransportForSharedPlayback()
    constructComposition(totalDurationSec)
    Tone.getTransport().seconds = startProgress * totalDurationSec
    Tone.getTransport().start()

    startTimeRef.current = performance.now() - startProgress * totalMs
    runProgressLoop(totalMs, onComplete)
  }

  const requestClockSync = (): void => {
    const requestId = generateRequestId()
    const clientSentAtMs = Date.now()
    const payload: MusicGroupClockSyncRequest = { requestId, clientSentAtMs }

    pendingClockRequestsRef.current.set(requestId, clientSentAtMs)
    ServerSocketService.Connection.emit('musicGroupClockSyncRequest', payload)
  }

  const startClockSyncInterval = (): void => {
    if (clockSyncIntervalRef.current !== null) {
      window.clearInterval(clockSyncIntervalRef.current)
    }

    clockSyncIntervalRef.current = window.setInterval(() => {
      requestClockSync()
    }, CLOCK_SYNC_INTERVAL_MS)
  }

  const stopClockSyncInterval = (): void => {
    if (clockSyncIntervalRef.current !== null) {
      window.clearInterval(clockSyncIntervalRef.current)
      clockSyncIntervalRef.current = null
    }

    pendingClockRequestsRef.current.clear()
    bestClockSyncRttMsRef.current = null
  }

  const emitGroupedPlaybackCommand = (eventName: string): void => {
    const payload: MusicGroupPlaybackCommand = { requestId: generateRequestId() }
    ServerSocketService.Connection.emit(eventName, payload)
  }

  const handleGroupedColumnFinished = (): void => {
    const schedule = activeGroupedScheduleRef.current
    if (!schedule) {
      return
    }

    progressRef.current = 1
    stopTransportPlayback(false)

    const payload: MusicGroupColumnFinishedPayload = {
      groupId: schedule.groupId,
      columnIndex: schedule.columnIndex,
      scheduleToken: schedule.scheduleToken,
    }
    ServerSocketService.Connection.emit('musicGroupColumnFinished', payload)
  }

  const handleGroupedScheduledColumn = (payload: MusicGroupColumnScheduledPayload): void => {
    const selfContext = selfGroupContextRef.current
    if (payload.groupId !== selfContext.groupId) {
      return
    }

    // Every group member mirrors the shared state, but only devices in the
    // active column actually schedule their local Tone transport.
    setPlayback(1)
    if (groupCommandPendingRef.current === 'play') {
      clearGroupCommandPending()
    }

    if (selfContext.columnIndex !== payload.columnIndex) {
      activeGroupedScheduleRef.current = null
      clearPendingGroupedStart()
      return
    }

    clearPendingGroupedStart()
    stopTransportPlayback(false)

    const totalMs = getCompositionDurationMs(payload.sharedBpm)
    const nextProgress = Math.max(0, Math.min(1, payload.resumePositionMs / totalMs))
    const localStartTimeMs = payload.scheduledStartTimeMs + serverClockOffsetMsRef.current
    const rawDelayMs = localStartTimeMs - Date.now()
    const delayMs = Math.max(0, rawDelayMs)

    console.log('shared playback start received', {
      groupId: payload.groupId,
      columnIndex: payload.columnIndex,
      scheduleToken: payload.scheduleToken,
      scheduledStartTimeMs: payload.scheduledStartTimeMs,
      localStartTimeMs,
      rawDelayMs,
      delayMs,
      serverClockOffsetMs: serverClockOffsetMsRef.current,
    })

    pendingGroupedStartTokenRef.current = payload.scheduleToken
    activeGroupedScheduleRef.current = {
      groupId: payload.groupId,
      columnIndex: payload.columnIndex,
      scheduleToken: payload.scheduleToken,
      sharedBpm: payload.sharedBpm,
    }
    syncGroupPlaybackDebugSnapshot({
      groupId: payload.groupId,
      columnIndex: payload.columnIndex,
      scheduleToken: payload.scheduleToken,
    })

    const startScheduledColumn = (): void => {
      if (pendingGroupedStartTokenRef.current !== payload.scheduleToken) {
        return
      }

      pendingGroupedStartTimerRef.current = null
      pendingGroupedStartTokenRef.current = null
      progressRef.current = nextProgress
      void startTransportPlayback(payload.sharedBpm, nextProgress, handleGroupedColumnFinished).catch((error: unknown) => {
        console.error('Failed to start shared playback', error)
      })
    }

    if (delayMs === 0) {
      startScheduledColumn()
      return
    }

    pendingGroupedStartTimerRef.current = window.setTimeout(startScheduledColumn, delayMs)
  }

  const handleGroupedPauseCapture = (payload: MusicGroupPauseCapturePayload): void => {
    const selfContext = selfGroupContextRef.current
    const activeSchedule = activeGroupedScheduleRef.current

    if (
      payload.groupId !== selfContext.groupId ||
      selfContext.columnIndex !== payload.columnIndex ||
      !activeSchedule ||
      activeSchedule.scheduleToken !== payload.scheduleToken
    ) {
      return
    }

    clearPendingGroupedStart()
    stopTransportPlayback(false)
    setPlayback(2)

    const totalMs = getCompositionDurationMs(activeSchedule.sharedBpm)
    const pausedPositionMs = Math.round(progressRef.current * totalMs)
    const reportPayload: MusicGroupPauseReportPayload = {
      groupId: payload.groupId,
      requestId: payload.requestId,
      scheduleToken: payload.scheduleToken,
      positionMs: pausedPositionMs,
    }
    ServerSocketService.Connection.emit('musicGroupPauseReport', reportPayload)
  }

  const handleGroupedPaused = (payload: MusicGroupPausedPayload): void => {
    const selfContext = selfGroupContextRef.current
    if (payload.groupId !== selfContext.groupId) {
      return
    }

    clearPendingGroupedStart()
    stopTransportPlayback(false)
    setPlayback(2)
    if (groupCommandPendingRef.current === 'pause') {
      clearGroupCommandPending()
    }
    syncGroupPlaybackDebugSnapshot({
      groupId: payload.groupId,
      columnIndex: payload.columnIndex,
      scheduleToken: payload.scheduleToken,
    })

    // Only the currently active column applies the paused cursor resync.
    // Inactive columns stay at 0 because they were not playing when pause occurred.
    if (selfContext.columnIndex !== payload.columnIndex) {
      progressRef.current = 0
      return
    }

    const groupBpm = selfContext.sharedBpm ?? MUSIC_GROUP_SHARED_BPM
    const totalMs = getCompositionDurationMs(groupBpm)
    progressRef.current = Math.max(0, Math.min(1, payload.pausedPositionMs / totalMs))
  }

  const handleGroupedCancelScheduledStart = (payload: MusicGroupCancelScheduledStartPayload): void => {
    const selfContext = selfGroupContextRef.current
    if (payload.groupId !== selfContext.groupId || pendingGroupedStartTokenRef.current !== payload.scheduleToken) {
      return
    }

    clearPendingGroupedStart()
    syncGroupPlaybackDebugSnapshot({ scheduleToken: null })
  }

  const handleGroupedReset = (payload: MusicGroupResetPayload): void => {
    const selfContext = selfGroupContextRef.current
    if (payload.groupId !== selfContext.groupId) {
      return
    }

    clearPendingGroupedStart()
    stopTransportPlayback(true)
    clearGroupCommandPending()
    setPlayback(0)
    syncGroupPlaybackDebugSnapshot({
      groupId: payload.groupId,
      columnIndex: null,
      scheduleToken: null,
    })
  }

  const handlePlayPause = async (): Promise<void> => {
    if (groupCommandPending) {
      return
    }

    await ensureAudioContextRunning()

    if (isGrouped) {
      if (playback === 1) {
        markGroupCommandPending('pause')
        emitGroupedPlaybackCommand('musicGroupPauseRequest')
      } else {
        markGroupCommandPending('play')
        emitGroupedPlaybackCommand('musicGroupPlayRequest')
      }
      return
    }

    if (playback === 1) setPlayback(2)
    else setPlayback(1)
  }

  const handleStop = (): void => {
    if (groupCommandPending) {
      return
    }

    if (isGrouped) {
      markGroupCommandPending('stop')
      emitGroupedPlaybackCommand('musicGroupStopRequest')
      return
    }

    setPlayback(0)
  }

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

  useEffect(() => {
    const isWithinTolerance = (value: number | null, target: number, toleranceDeg: number): boolean => {
      if (value === null) {
        return false
      }
      return Math.abs(value - target) <= toleranceDeg
    }

    const processTiltEvent = (event: DeviceOrientationEvent): void => {
      octaveTiltAnalyzerRef.current?.addARecord(event)
      setTiltDebugSnapshot(octaveTiltAnalyzerRef.current?.getDebugSnapshot() ?? null)
      pourToCopyTiltAnalyzerRef.current?.addARecord(event)
      setTiltDebugSnapshot(pourToCopyTiltAnalyzerRef.current?.getDebugSnapshot() ?? null)
    }

    const getActivePourDirectionFromOrientation = (event: DeviceOrientationEvent): 'left' | 'right' | null => {
      const isWithinGammaRange = isWithinTolerance(event.gamma, 0, 5)
      if (!isWithinGammaRange) {
        return null
      }

      if (isWithinTolerance(event.beta, 40, 15)) {
        return 'right'
      }

      if (isWithinTolerance(event.beta, -40, 15)) {
        return 'left'
      }

      return null
    }

    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (!hasSnappedNeighborRef.current) {
        setPourAttemptDirection(null)
        processTiltEvent(event)
        return
      }

      // The badge is purely local feedback: show only while current sample
      // is inside a valid pour orientation and the device has neighbors.
      const activePourDirection = getActivePourDirectionFromOrientation(event)
      setPourAttemptDirection(activePourDirection)

      processTiltEvent(event)
    }

    window.addEventListener('deviceorientation', handleDeviceOrientation)

    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation)
    }
  }, [setOctave])

  // Device motion effect
  useEffect(() => {
    const handleDeviceAcceleration = (event: DeviceMotionEvent) => {
      if (!permissionGranted) return;

      const acceleration = event.acceleration;
      const x = acceleration?.x || 0;
      const y = acceleration?.y || 0;
      // Don't use z-axis because it can be affected by gravity and may not accurately represent shake events
      // When a tablet is turned upside down, the z-axis will send very high values for some reason (gravity?).
      // The octave change is very close to triggering this behavior, so we will ignore z-axis for now. We can revisit this later if needed.
      const z = 1;

      // Send individual acceleration data to server for shake detection
      // console.log(`📱 Sending deviceMotion:`, { x: x, y: y, z: z });
      ServerSocketService.emit('acceleration', { x, y, z });
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
      bestClockSyncRttMsRef.current = null
      requestClockSync()
      startClockSyncInterval()
      requestDeviceMotionPermission();
    }

    const onDisconnect = (reason: string): void => {
      console.log(`Disconnected from SimSnap server: ${reason}`)
      stopClockSyncInterval()
      clearGroupCommandPending()
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
      bestClockSyncRttMsRef.current = null
      requestClockSync()
      startClockSyncInterval()
    }

    const onReconnectError = (): void => {
      stopClockSyncInterval()
      syncConnectionState()
    }

    const onReconnectFailed = (): void => {
      stopClockSyncInterval()
      clearGroupCommandPending()
      syncConnectionState()
    }

    const onClientSize = (event: { width: number; height: number }): void => {
      console.log('📐 Screen size sent:', event.width, 'x', event.height)
    }

    const onSnapBorder = (snapedDeviceId: string, position: string, color: string): void => {
      console.log(
        `🔗 Snap border received: device=${snapedDeviceId}, position=${position}, color=${color}`
      )

      setlastTimeSnapOrUnsnapContext(Date.now()) // Update the last time a snap or unsnap event occurred

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

      setlastTimeSnapOrUnsnapContext(Date.now()) // Update the last time a snap or unsnap event occurred

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

    const onMusicGroupClockSyncResponse = (payload: MusicGroupClockSyncResponse): void => {
      const startedAt = pendingClockRequestsRef.current.get(payload.requestId)
      if (startedAt === undefined) {
        return
      }

      pendingClockRequestsRef.current.delete(payload.requestId)
      const receivedAtMs = Date.now()
      const roundTripMs = receivedAtMs - startedAt
      const estimatedServerTimeAtReceiveMs = payload.serverTimeMs + roundTripMs / 2
      const currentBestRttMs = bestClockSyncRttMsRef.current

      if (currentBestRttMs !== null && roundTripMs > currentBestRttMs) {
        return
      }

      bestClockSyncRttMsRef.current = roundTripMs
      // Store the local clock skew as client minus server so a positive value
      // means the client clock is ahead of the server clock.
      serverClockOffsetMsRef.current = Date.now() - estimatedServerTimeAtReceiveMs
      console.log('clock sync sample', {
        requestId: payload.requestId,
        clientSentAtMs: payload.clientSentAtMs,
        serverTimeMs: payload.serverTimeMs,
        receivedAtMs,
        roundTripMs,
        bestClockSyncRttMs: bestClockSyncRttMsRef.current,
        estimatedServerTimeAtReceiveMs,
        clientClockOffsetMs: serverClockOffsetMsRef.current,
      })
      syncGroupPlaybackDebugSnapshot({ serverClockOffsetMs: serverClockOffsetMsRef.current })
    }

    const onMusicGroupColumnScheduled = (payload: MusicGroupColumnScheduledPayload): void => {
      handleGroupedScheduledColumn(payload)
    }

    const onMusicGroupPauseCapture = (payload: MusicGroupPauseCapturePayload): void => {
      handleGroupedPauseCapture(payload)
    }

    const onMusicGroupPaused = (payload: MusicGroupPausedPayload): void => {
      handleGroupedPaused(payload)
    }

    const onMusicGroupCancelScheduledStart = (payload: MusicGroupCancelScheduledStartPayload): void => {
      handleGroupedCancelScheduledStart(payload)
    }

    const onMusicGroupReset = (payload: MusicGroupResetPayload): void => {
      handleGroupedReset(payload)
    }

    const onPourTransferResolved = (payload: PourTransferResolvedPayload): void => {
      const localDeviceId = selfDeviceIdRef.current
      if (!localDeviceId) {
        return
      }

      if (localDeviceId === payload.giverDeviceId) {
        return
      }

      if (localDeviceId === payload.receiverDeviceId) {
        if (hasSnappedNeighborRef.current) {
          clearPastedFromDirectionTimer()
          const directionFromReceiver = payload.directionFromGiver === 'right' ? 'left' : 'right'
          setPastedFromDirection(directionFromReceiver)

          pastedFromDirectionTimerRef.current = window.setTimeout(() => {
            setPastedFromDirection(null)
            pastedFromDirectionTimerRef.current = null
          }, 2000)
        }

        mergeIncomingTransferredCompositions(payload)
      }
    }

    const onConnectedToServer = (isConnected: boolean): void => {
      setConnectedToServer(isConnected && ServerSocketService.Connection.connected)
      if (!isConnected || !ServerSocketService.Connection.connected) {
        setSnapBorders([])
        setMusicGroupState(null)
        setPourAttemptDirection(null)
        setPastedFromDirection(null)
        clearPastedFromDirectionTimer()
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
    ServerSocketService.Connection.on('musicGroupClockSyncResponse', onMusicGroupClockSyncResponse)
    ServerSocketService.Connection.on('musicGroupColumnScheduled', onMusicGroupColumnScheduled)
    ServerSocketService.Connection.on('musicGroupPauseCapture', onMusicGroupPauseCapture)
    ServerSocketService.Connection.on('musicGroupPaused', onMusicGroupPaused)
    ServerSocketService.Connection.on('musicGroupCancelScheduledStart', onMusicGroupCancelScheduledStart)
    ServerSocketService.Connection.on('musicGroupReset', onMusicGroupReset)
    ServerSocketService.Connection.on('pourTransferResolved', onPourTransferResolved)
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
      stopClockSyncInterval()
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
      ServerSocketService.Connection.off('musicGroupClockSyncResponse', onMusicGroupClockSyncResponse)
      ServerSocketService.Connection.off('musicGroupColumnScheduled', onMusicGroupColumnScheduled)
      ServerSocketService.Connection.off('musicGroupPauseCapture', onMusicGroupPauseCapture)
      ServerSocketService.Connection.off('musicGroupPaused', onMusicGroupPaused)
      ServerSocketService.Connection.off('musicGroupCancelScheduledStart', onMusicGroupCancelScheduledStart)
      ServerSocketService.Connection.off('musicGroupReset', onMusicGroupReset)
      ServerSocketService.Connection.off('pourTransferResolved', onPourTransferResolved)
      ServerSocketService.Connection.off('connectedToServer', onConnectedToServer)
      clearPastedFromDirectionTimer()
      ServerSocketService.emit('destroy', undefined);
      containerRef.current!.onpointerdown = null;
      containerRef.current!.onpointermove = null;
      containerRef.current!.onpointerup = null;
    }
  }, [])

  useEffect(() => {
    //Handle volume (0 = current decibel level of the device)
    if (volume <= -40) {
      Tone.getDestination().mute = true;
    } else if (volume <= 0) {
      Tone.getDestination().mute = false;
      Tone.getDestination().volume.value = volume;
    } else { //Going above 0 dB is risky. It can harm your audio quality, your equipment, and your hearing
      Tone.getDestination().mute = true; //Safety silent mode
    }
  }, [volume])

  useEffect(() => {
    if (isGrouped) {
      return () => {
        cancelAnimationLoop()
      }
    }

    //Composition is playing
    if (playback === 1) {
      startTransportPlayback(playbackBpm, progressRef.current, () => {
        progressRef.current = 0
        setPlayback('stop')
      })
    } else {
      stopTransportPlayback(playback === 0 || playback == 'stop')

      if (playback === 0 || playback == 'stop') {
        progressRef.current = 0
      }
    }

    return () => {
      cancelAnimationLoop()
    }
  }, [isGrouped, playback, playbackBpm, setPlayback])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'grid',
        gridTemplateRows: '1fr 8fr',
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
            <TopBar
              volume={volume}
              setVolume={setVolume}
              displayedBpm={playbackBpm}
              isGroupBpmLocked={isGrouped}
              groupedControlsDisabled={isGrouped && !!groupCommandPending}
              audioContextUnlocked={audioContextUnlocked}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
            />
            {instrument === Instrument.Drums ? <DrumSpace progressRef={progressRef} /> : <NoteSpace progressRef={progressRef} playbackState={playback} />}

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

      <DebugOverlay
        enabled={SHOW_DEBUG_OVERLAY.server}
        title={`${connectedToServer ? '🟢' : '🔴'} server: ${connectedToServer ? 'connected' : 'disconnected'}`}
        values={new Map<string, any>()}
        style={{ right: '8px', top: '8px', zIndex: 50 }}
      />


      <DebugOverlay
        enabled={SHOW_DEBUG_OVERLAY.group}
        title="group status"
        values={new Map<string, any>([
          ['group', selfDeviceState?.groupId ?? 'none'],
          [
            'position',
            selfDeviceState?.position
              ? `[col: ${selfDeviceState.position.col}, row: ${selfDeviceState.position.row}]`
              : 'n/a',
          ],
          ['bpm', currentGroup?.sharedBpm ?? bpm],
        ])}
        style={{ left: '8px', top: '8px', zIndex: 50 }}
      />

      <DebugOverlay
        enabled={SHOW_DEBUG_OVERLAY.playback}
        title="group playback"
        values={new Map<string, any>([
          ['group', groupPlaybackDebugSnapshot.groupId ?? 'none'],
          ['column', groupPlaybackDebugSnapshot.columnIndex ?? 'n/a'],
          ['token', groupPlaybackDebugSnapshot.scheduleToken ?? 'n/a'],
          ['clock offset', `${Math.round(groupPlaybackDebugSnapshot.serverClockOffsetMs)} ms`],
        ])}
        style={{ right: '8px', bottom: '8px', zIndex: 50 }}
      />

      {isSnappedWithAnotherDevice && pourAttemptDirection && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            background: 'rgba(8, 12, 20, 0.86)',
            color: '#fff',
            borderRadius: '999px',
            border: '1px solid rgba(255, 255, 255, 0.45)',
            padding: '6px 12px',
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          pouring to the {pourAttemptDirection}
        </div>
      )}

      {isSnappedWithAnotherDevice && pastedFromDirection && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 60,
            background: 'rgba(10, 16, 28, 0.9)',
            color: '#fff',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.35)',
            padding: '14px 22px',
            fontFamily: 'monospace',
            fontSize: 'clamp(20px, 3.2vw, 40px)',
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          composition pasted from the {pastedFromDirection}
        </div>
      )}

      {SHOW_DEBUG_OVERLAY.tilt && tiltDebugSnapshot && (
        <DebugOverlay
          title="tilting values"
          values={new Map<string, any>([
            ['alpha', tiltDebugSnapshot.latestRecord?.alpha?.toFixed(1) ?? 'n/a'],
            ['beta', tiltDebugSnapshot.latestRecord?.beta?.toFixed(1) ?? 'n/a'],
            ['gamma', tiltDebugSnapshot.latestRecord?.gamma?.toFixed(1) ?? 'n/a'],
            ['machines', tiltDebugSnapshot.machines],
          ])}
          style={{ left: '8px', bottom: '8px', zIndex: 50 }}
        />
      )}
    </div>
  )
}

export default App