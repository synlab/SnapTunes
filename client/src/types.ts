/**
 * Musical notes (white keys on a piano)
 */
export const WHITE_NOTES = ['B', 'A', 'G', 'F', 'E', 'D', 'C'] as const

export type WhiteNote = (typeof WHITE_NOTES)[number]



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
export const GRID_ROWS = WHITE_NOTES.length

/**
 * Indicates which notes have a sharp below them
 */
export const HAS_SHARP_BELOW: Record<WhiteNote, boolean> = {
  B: true,
  A: true,
  G: true,
  F: false,
  E: true,
  D: true,
  C: false,
}

export interface NoteData {
  pitch: WhiteNote
  startTime: number
  duration: number
}

/**
 * Represents a quantized musical note
 */
export class Note implements NoteData {
  pitch: WhiteNote
  startTime: number
  duration: number

  constructor(pitch: WhiteNote, startTime: number, duration: number) {
    this.pitch = pitch
    this.startTime = startTime // 0-1, representing position on the timeline
    this.duration = duration // 0-1, representing position on the timeline
  }
}