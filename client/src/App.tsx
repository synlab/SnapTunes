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
  MusicGroupBpmEditBeginRequest,
  MusicGroupBpmEditEndRequest,
  MusicGroupBpmSetRequest,
  MusicGroupBpmStatePayload,
  MusicGroupCancelScheduledStartPayload,
  MusicGroupClockSyncRequest,
  MusicGroupClockSyncResponse,
  MusicGroupColumnFinishedPayload,
  MusicGroupColumnScheduledPayload,
  MusicGroupLoopSetRequest,
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
import tiltBackGif from './assets/tilt_back_octave.gif';

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
const INITIAL_GROUP_PLAY_SYNC_WAIT_MS = 350

const soundOctaveUp = new Audio('/audio/feedback/OctaveChangeUp.wav');
const soundOctaveDown = new Audio('/audio/feedback/OctaveChangeDown.wav');

type GroupControlCommand = 'play' | 'pause' | 'stop'

const clampProgress = (value: number): number => Math.max(0, Math.min(1, value))

function App() {
  // Context hooks for accessing and updating the global state
  const { instrument } = ctx.useInstrument()
  const { playback } = ctx.usePlayback()
  const { setPlayback } = ctx.useUpdatePlayback()
  const { setComposition } = ctx.useUpdateComposition()
  const { setDrumsComposition } = ctx.useUpdateDrumsComposition()
  const { bpm } = ctx.useBPM()
  const { setBPM } = ctx.useUpdateBPM()
  const { composition } = ctx.useComposition()
  const { drumsComposition } = ctx.useDrumsComposition()
  const { octave } = ctx.useOctave()
  const { setOctave } = ctx.useUpdateOctave()
  const { requestClear } = ctx.useUpdateClear();
  const { undo } = ctx.useUndo();

  // Context for tracking the last time a snap or unsnap event occurred, used to determine if an undo should be triggered after such events.
  const { setlastTimeSnapOrUnsnapContext } = simsnapctx.useUpdateLastTimeSnapOrUnsnapContext()

  // Refs for tracking individual state variables of a device without triggering re-renders. These are used for playback and group synchronization logic.
  const progressRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const instrumentRef = useRef<Instrument | null>(instrument)
  const playbackRef = useRef<0 | 1 | 2 | 'stop'>(playback)
  const isGroupedRef = useRef<boolean>(false)
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
  const pendingGroupedStartAtMsRef = useRef<number | null>(null)
  const queuedGroupedStartRef = useRef<MusicGroupColumnScheduledPayload | null>(null)
  const activeGroupedScheduleRef = useRef<ActiveGroupedSchedule | null>(null)
  const waitingForInitialGroupClockSyncRef = useRef<boolean>(false)
  const initialGroupedPlayFallbackTimerRef = useRef<number | null>(null)
  const lastGroupTopologySignatureRef = useRef<string | null>(null)
  const selfDeviceIdRef = useRef<string | null>(null)
  const previousInstrumentRef = useRef<Instrument | null>(instrument)
  const pastedFromDirectionTimerRef = useRef<number | null>(null)
  const hasSnappedNeighborRef = useRef<boolean>(false)
  const bpmSliderInteractionActiveRef = useRef<boolean>(false)


  const [snapBorders, setSnapBorders] = useState<SnapBorder[]>([])
  const [musicGroupState, setMusicGroupState] = useState<MusicGroupStatePayload | null>(null)
  const [connectedToServer, setConnectedToServer] = useState<boolean>(false)
  const [volume, setVolume] = useState<number>(-20)
  const [loopEnabledLocal, setLoopEnabledLocal] = useState<boolean>(false)
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false)
  const [groupCommandPending, setGroupCommandPending] = useState<GroupControlCommand | null>(null)
  const [groupPlaybackDebugSnapshot, setGroupPlaybackDebugSnapshot] = useState<GroupPlaybackDebugSnapshot>({
    groupId: null,
    columnIndex: null,
    scheduleToken: null,
    serverClockOffsetMs: 0,
  })
  const [tiltDebugSnapshot, setTiltDebugSnapshot] = useState<ReturnType<OctaveChangeTiltAnalyzer['getDebugSnapshot']> | null>(null)

  // Refs and state for managing the pour-to-copy/paste interaction
  const pourToCopyTiltAnalyzerRef = useRef<PourToCopyPasteTiltAnalyzer | null>(null)
  const groupCommandTimeoutRef = useRef<number | null>(null)
  const [pourAttemptDirection, setPourAttemptDirection] = useState<'left' | 'right' | null>(null)
  const [pastedFromDirection, setPastedFromDirection] = useState<'left' | 'right' | null>(null)

  // Refs and state for managing the octave change interaction
  const octaveTiltAnalyzerRef = useRef<OctaveChangeTiltAnalyzer | null>(null)

  const groupCommandPendingRef = useRef<GroupControlCommand | null>(null)
  const loopEnabledLocalRef = useRef<boolean>(false)
  const groupedLoopEnabledRef = useRef<boolean>(false)
  const isOneColumnGroupRef = useRef<boolean>(false)

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
        pausePlaybackSoloOrIfCurrentlyPlayingGroupPart()
      } else if (interaction.type === 'octaveChangeDown' && octave > 0) {
        setOctave((prev) => prev - 1)
        soundOctaveDown.play();
        pausePlaybackSoloOrIfCurrentlyPlayingGroupPart()
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
  const isPlaybackActive = playback === 1
  const playbackBpm = currentGroup?.sharedBpm ?? bpm
  const loopEnabled = isGrouped ? (currentGroup?.loopEnabled ?? false) : loopEnabledLocal
  const isOneColumnGroup = isGrouped ? (currentGroup?.isOneColumnGroup ?? false) : false
  const isBpmLockedByPeer = isGrouped
    && !!currentGroup?.bpmEditOwnerDeviceId
    && currentGroup.bpmEditOwnerDeviceId !== selfDeviceId
  const isBpmSliderDisabled = isPlaybackActive || isBpmLockedByPeer

  const isSupposedlyPlayingGroupedPart = (): boolean => {
    const activeSchedule = activeGroupedScheduleRef.current

    return Boolean(
      isGroupedRef.current &&
      playbackRef.current === 1 &&
      animFrameRef.current !== null &&
      activeSchedule &&
      activeSchedule.groupId === selfGroupContextRef.current.groupId &&
      activeSchedule.columnIndex === selfGroupContextRef.current.columnIndex
    )
  }

  useEffect(() => {
    selfDeviceIdRef.current = selfDeviceId
  }, [selfDeviceId])

  useEffect(() => {
    loopEnabledLocalRef.current = loopEnabledLocal
  }, [loopEnabledLocal])

  useEffect(() => {
    groupedLoopEnabledRef.current = isGrouped ? (currentGroup?.loopEnabled ?? false) : false
    isOneColumnGroupRef.current = isOneColumnGroup
  }, [currentGroup, isGrouped, isOneColumnGroup])

  useEffect(() => {
    hasSnappedNeighborRef.current = isSnappedWithAnotherDevice
  }, [isSnappedWithAnotherDevice])

  useEffect(() => {
    if (!isGrouped || isBpmSliderDisabled) {
      bpmSliderInteractionActiveRef.current = false
    }
  }, [isGrouped, isBpmSliderDisabled])


  // Update refs whenever the corresponding context state variables change
  useEffect(() => {
    instrumentRef.current = instrument
  }, [instrument])

  // Stop playback if the instrument changes while playing, to avoid playing the wrong instrument's sound.
  useEffect(() => {
    const previousInstrument = previousInstrumentRef.current
    previousInstrumentRef.current = instrument

    if (previousInstrument === instrument) {
      return
    }
    pausePlaybackSoloOrIfCurrentlyPlayingGroupPart()

  }, [instrument, setPlayback])

  useEffect(() => {
    playbackRef.current = playback
  }, [playback])

  useEffect(() => {
    isGroupedRef.current = isGrouped
  }, [isGrouped])

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
    if (!musicGroupState) {
      lastGroupTopologySignatureRef.current = null
      return
    }

    const selfState = musicGroupState.devices[musicGroupState.selfDeviceId]
    const selfSignature = `${selfState?.groupId ?? 'none'}:${selfState?.position?.col ?? 'na'}:${selfState?.position?.row ?? 'na'}`
    const groupsSignature = musicGroupState.groups
      // Topology signature must only include structure (group ids + layout).
      // Shared BPM changes are state updates, not topology mutations.
      .map((group) => `${group.id}:${group.steps.map((step) => step.join(',')).join('|')}`)
      .sort()
      .join(';')

    const topologySignature = `${selfSignature}::${groupsSignature}`
    if (lastGroupTopologySignatureRef.current === topologySignature) {
      return
    }

    // Entering/leaving a group or changing topology invalidates local timeline.
    // Non-topology updates (like loop mode flag sync) should not force a reset.
    lastGroupTopologySignatureRef.current = topologySignature

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
    pendingGroupedStartAtMsRef.current = null
    queuedGroupedStartRef.current = null
  }

  const clearGroupCommandPending = (): void => {
    if (groupCommandTimeoutRef.current !== null) {
      window.clearTimeout(groupCommandTimeoutRef.current)
      groupCommandTimeoutRef.current = null
    }

    if (initialGroupedPlayFallbackTimerRef.current !== null) {
      window.clearTimeout(initialGroupedPlayFallbackTimerRef.current)
      initialGroupedPlayFallbackTimerRef.current = null
    }

    groupCommandPendingRef.current = null
    waitingForInitialGroupClockSyncRef.current = false
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
    }, 1000)
  }

  const ensureAudioContextRunning = async (): Promise<boolean> => {
    try {
      await Tone.start()
      await Tone.getContext().rawContext.resume()
      const isRunning = Tone.getContext().state === 'running'

      if (!isRunning) {
        console.warn('AudioContext is not running after resume attempt', {
          state: Tone.getContext().state,
        })
      }

      return isRunning
    } catch (error) {
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
  
  const pausePlaybackSoloOrIfCurrentlyPlayingGroupPart = (): void => {
    if (isSupposedlyPlayingGroupedPart()) {
      if (!groupCommandPendingRef.current) {
        markGroupCommandPending('pause')
        emitGroupedPlaybackCommand('musicGroupPauseRequest')
      }
    } else if (!isGroupedRef.current && playbackRef.current === 1) {
      setPlayback(2)
    }
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
    waitingForInitialGroupClockSyncRef.current = false
    if (initialGroupedPlayFallbackTimerRef.current !== null) {
      window.clearTimeout(initialGroupedPlayFallbackTimerRef.current)
      initialGroupedPlayFallbackTimerRef.current = null
    }
  }



  const emitGroupedPlaybackCommand = (eventName: string): void => {
    const payload: MusicGroupPlaybackCommand = { requestId: generateRequestId() }
    ServerSocketService.Connection.emit(eventName, payload)
  }

  const emitGroupedLoopSetRequest = (enabled: boolean): void => {
    const payload: MusicGroupLoopSetRequest = {
      requestId: generateRequestId(),
      enabled,
    }
    ServerSocketService.Connection.emit('musicGroupLoopSetRequest', payload)
  }

  const beginGroupedBpmEdit = (): void => {
    if (!isGrouped || isBpmSliderDisabled || bpmSliderInteractionActiveRef.current) {
      return
    }

    const payload: MusicGroupBpmEditBeginRequest = { requestId: generateRequestId() }
    bpmSliderInteractionActiveRef.current = true
    ServerSocketService.Connection.emit('musicGroupBpmEditBeginRequest', payload)
  }

  const emitGroupedBpmSetRequest = (nextBpm: number): void => {
    if (!isGrouped || isBpmSliderDisabled) {
      return
    }

    if (!bpmSliderInteractionActiveRef.current) {
      beginGroupedBpmEdit()
    }

    const payload: MusicGroupBpmSetRequest = {
      requestId: generateRequestId(),
      bpm: nextBpm,
    }
    ServerSocketService.Connection.emit('musicGroupBpmSetRequest', payload)
  }

  const endGroupedBpmEdit = (): void => {
    if (!bpmSliderInteractionActiveRef.current) {
      return
    }

    bpmSliderInteractionActiveRef.current = false

    if (!isGrouped) {
      return
    }

    const payload: MusicGroupBpmEditEndRequest = { requestId: generateRequestId() }
    ServerSocketService.Connection.emit('musicGroupBpmEditEndRequest', payload)
  }

  const handleBpmChange = (nextBpm: number): void => {
    if (isGrouped) {
      emitGroupedBpmSetRequest(nextBpm)
      return
    }

    setBPM(nextBpm)
  }

  const handleGroupedTransportComplete = (): void => {
    const schedule = activeGroupedScheduleRef.current
    if (!schedule) {
      return
    }

    if (isGroupedRef.current && isOneColumnGroupRef.current && groupedLoopEnabledRef.current) {
      progressRef.current = 0
      stopTransportPlayback(false)

      void startTransportPlayback(schedule.sharedBpm, 0, handleGroupedTransportComplete).catch((error: unknown) => {
        console.error('Failed to restart grouped single-column loop playback', error)
      })
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
      // Pre-armed schedules for other columns are expected and must not cancel
      // this device's own pending/current column start.
      return
    }

    const totalMs = getCompositionDurationMs(payload.sharedBpm)
    const nextProgress = clampProgress(payload.resumePositionMs / totalMs)
    const localStartTimeMs = payload.scheduledStartTimeMs + serverClockOffsetMsRef.current
    const rawDelayMs = localStartTimeMs - Date.now()
    const delayMs = Math.max(0, rawDelayMs)
    const incomingStartTimeMs = payload.scheduledStartTimeMs
    const activeSchedule = activeGroupedScheduleRef.current
    const shouldQueueWhileCurrentRuns =
      rawDelayMs > 0 &&
      !!activeSchedule &&
      activeSchedule.groupId === payload.groupId &&
      activeSchedule.columnIndex === payload.columnIndex &&
      activeSchedule.scheduleToken !== payload.scheduleToken

    const pendingToken = pendingGroupedStartTokenRef.current
    const pendingStartAtMs = pendingGroupedStartAtMsRef.current
    const nowMs = Date.now()
    const hasFuturePendingStart =
      pendingToken !== null &&
      pendingStartAtMs !== null &&
      pendingStartAtMs > nowMs

    const shouldKeepExistingPendingStart =
      hasFuturePendingStart &&
      pendingStartAtMs <= incomingStartTimeMs &&
      pendingToken !== payload.scheduleToken

    if (shouldKeepExistingPendingStart) {
      queuedGroupedStartRef.current = payload
      return
    }

    // Keep only one local pending start timer/token at a time. Newer server
    // schedules supersede older ones if they target this same device column.
    clearPendingGroupedStart()

    if (!shouldQueueWhileCurrentRuns) {
      stopTransportPlayback(false)
    }

    pendingGroupedStartTokenRef.current = payload.scheduleToken
    pendingGroupedStartAtMsRef.current = incomingStartTimeMs
    // Record pending token for debug visibility. Active schedule is updated only
    // when the local handoff time is reached.
    syncGroupPlaybackDebugSnapshot({ scheduleToken: payload.scheduleToken })

    const startScheduledColumn = (): void => {
      if (pendingGroupedStartTokenRef.current !== payload.scheduleToken) {
        return
      }

      pendingGroupedStartTimerRef.current = null
      pendingGroupedStartTokenRef.current = null
      pendingGroupedStartAtMsRef.current = null
      progressRef.current = nextProgress
      // Token ownership moves from pending -> active exactly at local start,
      // which prevents early token replacement during pre-armed loop cycles.
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
      void startTransportPlayback(payload.sharedBpm, nextProgress, handleGroupedTransportComplete).catch((error: unknown) => {
        console.error('Failed to start shared playback', error)
      })

      const queuedStart = queuedGroupedStartRef.current
      if (queuedStart && queuedStart.scheduleToken !== payload.scheduleToken) {
        queuedGroupedStartRef.current = null
        handleGroupedScheduledColumn(queuedStart)
      }
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
    const isMatchingActiveSchedule =
      !!activeSchedule &&
      activeSchedule.scheduleToken === payload.scheduleToken
    const isMatchingPendingSchedule =
      pendingGroupedStartTokenRef.current === payload.scheduleToken

    if (
      payload.groupId !== selfContext.groupId ||
      selfContext.columnIndex !== payload.columnIndex ||
      (!isMatchingActiveSchedule && !isMatchingPendingSchedule)
    ) {
      return
    }

    clearPendingGroupedStart()
    stopTransportPlayback(false)
    setPlayback(2)

    // The active column reports progress in ms so the server can rebroadcast
    // one authoritative paused cursor for every client in the group.
    const sharedBpm = activeSchedule?.sharedBpm ?? selfContext.sharedBpm ?? MUSIC_GROUP_SHARED_BPM
    const totalMs = getCompositionDurationMs(sharedBpm)
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
    progressRef.current = clampProgress(payload.pausedPositionMs / totalMs)
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
      if (isPlaybackActive) {
        markGroupCommandPending('pause')
        emitGroupedPlaybackCommand('musicGroupPauseRequest')
        return
      }

      markGroupCommandPending('play')
      if (bestClockSyncRttMsRef.current === null) {
        waitingForInitialGroupClockSyncRef.current = true
        requestClockSync()

        // Safety fallback: if no sync response arrives quickly, still issue
        // the grouped play request so controls never stay locked.
        initialGroupedPlayFallbackTimerRef.current = window.setTimeout(() => {
          if (!waitingForInitialGroupClockSyncRef.current || groupCommandPendingRef.current !== 'play') {
            return
          }

          waitingForInitialGroupClockSyncRef.current = false
          initialGroupedPlayFallbackTimerRef.current = null
          emitGroupedPlaybackCommand('musicGroupPlayRequest')
        }, INITIAL_GROUP_PLAY_SYNC_WAIT_MS)
        return
      }

      // If we already have a recent RTT sample, skip the startup wait and ask
      // the server to schedule immediately.
      emitGroupedPlaybackCommand('musicGroupPlayRequest')
      return
    }

    if (isPlaybackActive) setPlayback(2)
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

  const handleLoopToggle = (): void => {
    if (isGrouped) {
      emitGroupedLoopSetRequest(!loopEnabled)
      return
    }

    setLoopEnabledLocal((previous) => !previous)
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

    const processTiltEvent = (event: DeviceOrientationEvent): void => {
      octaveTiltAnalyzerRef.current?.addARecord(event)
      setTiltDebugSnapshot(octaveTiltAnalyzerRef.current?.getDebugSnapshot() ?? null)
      pourToCopyTiltAnalyzerRef.current?.addARecord(event)
      setTiltDebugSnapshot(pourToCopyTiltAnalyzerRef.current?.getDebugSnapshot() ?? null)
    }

    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (!hasSnappedNeighborRef.current) {
        setPourAttemptDirection(null)
        processTiltEvent(event)
        return
      }

      processTiltEvent(event)

      // For visual feedback only
      setPourAttemptDirection(pourToCopyTiltAnalyzerRef.current?.isPouringRight() ? 'right' : pourToCopyTiltAnalyzerRef.current?.isPouringLeft() ? 'left' : null)

    }

    window.addEventListener('deviceorientation', handleDeviceOrientation)

    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation)
    }
  }, [setTiltDebugSnapshot])

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
      ServerSocketService.emit('acceleration', { x, y, z });
    };

    if (permissionGranted) {
      window.addEventListener('devicemotion', handleDeviceAcceleration);
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
      const strokeWidth = '15px'
      const isCurrentlyFullscreen = !!document.fullscreenElement

      setSnapBorders((prev) => [
        ...prev.filter((border) => border.id !== snapedDeviceId),
        {
          id: snapedDeviceId,
          x: isVerticalBorder ? (position === 'left' ? '0px' : `calc(100% - ${strokeWidth})`) : '0px',
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

      // Pause ongoing progression before clearing when shake-to-remove is triggered and the device is playing.
      pausePlaybackSoloOrIfCurrentlyPlayingGroupPart()

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
      syncGroupPlaybackDebugSnapshot({ serverClockOffsetMs: serverClockOffsetMsRef.current })

      if (waitingForInitialGroupClockSyncRef.current && groupCommandPendingRef.current === 'play') {
        if (initialGroupedPlayFallbackTimerRef.current !== null) {
          window.clearTimeout(initialGroupedPlayFallbackTimerRef.current)
          initialGroupedPlayFallbackTimerRef.current = null
        }
        waitingForInitialGroupClockSyncRef.current = false
        emitGroupedPlaybackCommand('musicGroupPlayRequest')
      }
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

    const onMusicGroupBpmState = (payload: MusicGroupBpmStatePayload): void => {
      setMusicGroupState((previous) => {
        if (!previous) {
          return previous
        }

        const nextGroups = previous.groups.map((group) => {
          if (group.id !== payload.groupId) {
            return group
          }

          return {
            ...group,
            sharedBpm: payload.sharedBpm,
            bpmEditOwnerDeviceId: payload.bpmEditOwnerDeviceId,
          }
        })

        return {
          ...previous,
          groups: nextGroups,
        }
      })

      const localDeviceId = selfDeviceIdRef.current
      if (!localDeviceId || payload.bpmEditOwnerDeviceId === localDeviceId) {
        return
      }

      bpmSliderInteractionActiveRef.current = false
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
        // Pause playback if the receiver is currently playing.
        pausePlaybackSoloOrIfCurrentlyPlayingGroupPart()
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
        bpmSliderInteractionActiveRef.current = false
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
    ServerSocketService.Connection.on('musicGroupBpmState', onMusicGroupBpmState)
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
      ServerSocketService.Connection.off('musicGroupBpmState', onMusicGroupBpmState)
      ServerSocketService.Connection.off('pourTransferResolved', onPourTransferResolved)
      ServerSocketService.Connection.off('connectedToServer', onConnectedToServer)
      clearPastedFromDirectionTimer()
      bpmSliderInteractionActiveRef.current = false
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
      // In grouped mode, local playback is driven by schedule events from the
      // server, so this local-only effect should stay inert.
      return () => {
        cancelAnimationLoop()
      }
    }

    //Composition is playing
    if (playback === 1) {
      const handleLocalPlaybackComplete = (): void => {
        if (loopEnabledLocalRef.current) {
          progressRef.current = 0
          void startTransportPlayback(playbackBpm, 0, handleLocalPlaybackComplete).catch((error: unknown) => {
            console.error('Failed to restart local loop playback', error)
          })
          return
        }

        progressRef.current = 0
        setPlayback('stop')
      }

      startTransportPlayback(playbackBpm, progressRef.current, () => {
        handleLocalPlaybackComplete()
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
        
          <ctx.SFXContextProvider>
            <TopBar
              volume={volume}
              setVolume={setVolume}
              displayedBpm={playbackBpm}
              bpmSliderDisabled={isBpmSliderDisabled}
              groupedControlsDisabled={isGrouped && !!groupCommandPending}
              loopEnabled={loopEnabled}
              onBpmEditBegin={beginGroupedBpmEdit}
              onBpmChange={handleBpmChange}
              onBpmEditEnd={endGroupedBpmEdit}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
              onToggleLoop={handleLoopToggle}
            />
            {instrument === Instrument.Drums ? <DrumSpace progressRef={progressRef} /> : <NoteSpace progressRef={progressRef} playbackState={playback} />}

          </ctx.SFXContextProvider>
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

      {SHOW_DEBUG_OVERLAY.tilt && tiltDebugSnapshot && (
        <DebugOverlay
          title="tilting values"
          values={new Map<string, any>([
            ['alpha', tiltDebugSnapshot.latestRecord?.alpha?.toFixed(1) ?? 'n/a'],
            ['beta', tiltDebugSnapshot.latestRecord?.beta?.toFixed(1) ?? 'n/a'],
            ['gamma', tiltDebugSnapshot.latestRecord?.gamma?.toFixed(1) ?? 'n/a'],
            ['machines', tiltDebugSnapshot.machines]
          ])}
          style={{ left: '8px', bottom: '8px', zIndex: 50 }}
        />
      )}

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

      {(octaveTiltAnalyzerRef.current?.isAwaitingReturnOctaveChangeUp()) && (
        <div
          style={{
            position: 'absolute',
            top: `0px`,
            left: `${window.innerWidth / 2 - 100}px`,
            zIndex: 60,
            width: '200px',
            background: 'rgba(10, 16, 28, 0.9)',
            color: '#fff',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.35)',
            padding: '14px 22px',
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: 300,
            textAlign: 'center',
            lineHeight: 1,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          return to the starting position to move up an octave
          <img height="100" src={tiltBackGif} alt="Tilt back to return to the starting position to move up an octave" />
        </div>
      )}

    </div>
  )
}

export default App