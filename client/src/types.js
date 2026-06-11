/**
 * Musical notes (white keys on a piano)
 */
export const WHITE_NOTES = ['B', 'A', 'G', 'F', 'E', 'D', 'C'];

/**
 * Grid configuration
 */
export const GRID_COLS = 16; // 8 * 2 sixteenth notes
export const GRID_ROWS = WHITE_NOTES.length; // 7 notes

/**
 * Indicates which notes have a sharp below them
 */
export const HAS_SHARP_BELOW = {
  B: true,
  A: true,
  G: true,
  F: false,
  E: true,
  D: true,
  C: false,
};

/**
 * Represents a quantized musical note
 */
export class Note {
  constructor(pitch, startTime, duration) {
    this.pitch = pitch; // e.g., 'C', 'D', etc. from WHITE_NOTES
    this.startTime = startTime; // 0-1, representing position on the timeline
    this.duration = duration; // 0-1, representing note length on the timeline
  }
}
