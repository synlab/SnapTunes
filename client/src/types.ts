/**
 * Musical notes (white keys on a piano)
 */
export const WHITE_NOTES = ['B', 'A', 'G', 'F', 'E', 'D', 'C'] as const

export type WhiteNote = (typeof WHITE_NOTES)[number]

/**
 * Grid configuration
 */
export const GRID_COLS = 16
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