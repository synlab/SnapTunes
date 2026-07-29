/**
 * Chromatic notes (single octave), ordered top-to-bottom for the piano roll.
 */
export const CHROMATIC_NOTES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'] as const

export type PitchNote = (typeof CHROMATIC_NOTES)[number]



export enum Instrument {
  Piano = "piano" ,
  Guitar = "guitar",
  Bells = "bells",
  Drums = "drums",
} 

export type InstrumentRgb = readonly [number, number, number]
export type InstrumentRgba = readonly [number, number, number, number]

export interface InstrumentTheme {
  hex: string
  rgb: InstrumentRgb
  softRgb: InstrumentRgb
  seekbar: InstrumentRgba
  noteFill: InstrumentRgba
  noteStroke: InstrumentRgb
}

export const INSTRUMENT_THEMES: Record<Instrument, InstrumentTheme> = {
  [Instrument.Piano]: {
    hex: '#4c66cf',
    rgb: [76, 102, 207],
    softRgb: [200, 212, 245],
    seekbar: [76, 102, 207, 40],
    noteFill: [76, 102, 207, 200],
    noteStroke: [50, 70, 180],
  },
  [Instrument.Guitar]: {
    hex: '#c86b31',
    rgb: [200, 107, 49],
    softRgb: [242, 214, 196],
    seekbar: [200, 107, 49, 40],
    noteFill: [200, 107, 49, 200],
    noteStroke: [158, 79, 31],
  },
  [Instrument.Bells]: {
    hex: '#2ea88f',
    rgb: [46, 168, 143],
    softRgb: [199, 234, 226],
    seekbar: [46, 168, 143, 40],
    noteFill: [46, 168, 143, 200],
    noteStroke: [22, 124, 105],
  },
  [Instrument.Drums]: {
    hex: '#cf4b7d',
    rgb: [207, 75, 125],
    softRgb: [244, 208, 220],
    seekbar: [207, 75, 125, 40],
    noteFill: [207, 75, 125, 200],
    noteStroke: [164, 42, 92],
  },
}

export enum Drum {
  Kick = 'B',
  Snare = 'A',
  HiHat = 'G',
  Clap = 'F'
} 

 
/**
 * Grid configuration
 */
export const GRID_COLS = 16 //One composition is composed of 16 beats (4 bar)
export const GRID_ROWS = CHROMATIC_NOTES.length

export interface NoteData {
  pitch: PitchNote
  startTime: number
  duration: number
}

/**
 * Represents a quantized musical note
 */
export class Note implements NoteData {
  pitch: PitchNote
  startTime: number
  duration: number

  constructor(pitch: PitchNote, startTime: number, duration: number) {
    this.pitch = pitch
    this.startTime = startTime // 0-1, representing position on the timeline
    this.duration = duration // 0-1, representing position on the timeline
  }
}

export interface GroupGridPosition {
  col: number
  row: number
}

export interface MusicGroupDeviceState {
  groupId: string | null
  position: GroupGridPosition | null
}

export interface MusicGroupStatePayload {
  selfDeviceId: string
  updatedAt: string
  groups: Array<{
    id: string
    steps: string[][]
    sharedBpm: number
    bpmEditOwnerDeviceId: string | null
    playbackStatus: 'idle' | 'playing' | 'paused'
    loopEnabled: boolean
  }>
  devices: Record<string, MusicGroupDeviceState>
}

// Shared group playback uses a fixed BPM for now so every device in a column
// computes the same transport duration even if their standalone BPM differs.
export const MUSIC_GROUP_SHARED_BPM = 120

export type MusicGroupResetReason = 'stop' | 'naturalEnd' | 'topologyChange'

export interface MusicGroupClockSyncRequest {
  requestId: string
  clientSentAtMs: number
}

export interface MusicGroupClockSyncResponse {
  requestId: string
  clientSentAtMs: number
  serverTimeMs: number
}

export interface MusicGroupPlaybackCommand {
  requestId: string
}

export interface MusicGroupLoopSetRequest {
  requestId: string
  enabled: boolean
}

export interface MusicGroupLoopStatePayload {
  groupId: string
  enabled: boolean
  sequence: number
}

export interface MusicGroupBpmEditBeginRequest {
  requestId: string
}

export interface MusicGroupBpmSetRequest {
  requestId: string
  bpm: number
}

export interface MusicGroupBpmEditEndRequest {
  requestId: string
}

export interface MusicGroupBpmStatePayload {
  groupId: string
  sharedBpm: number
  bpmEditOwnerDeviceId: string | null
  sequence: number
}

export interface MusicGroupColumnScheduledPayload {
  groupId: string
  columnIndex: number
  resumePositionMs: number
  scheduledStartTimeMs: number
  scheduleToken: number
  sharedBpm: number
}

export interface MusicGroupColumnFinishedPayload {
  groupId: string
  columnIndex: number
  scheduleToken: number
}

export interface MusicGroupPauseCapturePayload {
  groupId: string
  columnIndex: number
  requestId: string
  scheduleToken: number
}

export interface MusicGroupPauseReportPayload {
  groupId: string
  requestId: string
  scheduleToken: number
  positionMs: number
}

export interface MusicGroupPausedPayload {
  groupId: string
  columnIndex: number
  pausedPositionMs: number
  scheduleToken: number
}

export interface MusicGroupCancelScheduledStartPayload {
  groupId: string
  columnIndex: number
  scheduleToken: number
  reason: Exclude<MusicGroupResetReason, 'naturalEnd'> | 'pause'
}

export interface MusicGroupResetPayload {
  groupId: string
  reason: MusicGroupResetReason
  sequence: number
}