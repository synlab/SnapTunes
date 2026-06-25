import { Note, WHITE_NOTES, GRID_COLS, GRID_ROWS, type WhiteNote } from '../types'

export interface GridCell {
  col: number
  row: number
}

export const isInsideRelativeElementPosition = (
  x: number,
  y: number,
  width: number,
  height: number
): boolean => {
  return x > 0 && x < width && y > 0 && y < height
}

export const pointToGridCell = (
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number
): GridCell => {
  const cellWidth = canvasWidth / GRID_COLS
  const cellHeight = canvasHeight / GRID_ROWS

  const col = Math.floor(x / cellWidth)
  const row = Math.floor(y / cellHeight)

  return {
    col: Math.max(0, Math.min(col, GRID_COLS - 1)),
    row: Math.max(0, Math.min(row, GRID_ROWS - 1)),
  }
}

export const gridSpanToNote = (
  anchorCol: number,
  currentCol: number,
  row: number
): Note => {
  // A drag always maps to one contiguous note span on a single locked row.
  const safeRow = Math.max(0, Math.min(row, GRID_ROWS - 1))
  const startCol = Math.max(0, Math.min(Math.min(anchorCol, currentCol), GRID_COLS - 1))
  const endCol = Math.max(0, Math.min(Math.max(anchorCol, currentCol), GRID_COLS - 1))
  const duration = (endCol - startCol + 1) / GRID_COLS
  const pitch = WHITE_NOTES[safeRow] as WhiteNote

  return new Note(pitch, startCol / GRID_COLS, duration)
}

export const notesOverlap = (note1: Note, note2: Note): boolean => {
  if (note1.pitch !== note2.pitch) return false

  const end1 = note1.startTime + note1.duration
  const end2 = note2.startTime + note2.duration

  return note1.startTime < end2 && note2.startTime < end1
}

export const splitNoteByConflict = (existingNote: Note, newNote: Note): Note[] => {
  const eStart = existingNote.startTime
  const eEnd = eStart + existingNote.duration
  const nStart = newNote.startTime
  const nEnd = nStart + newNote.duration

  const fragments: Note[] = []

  if (eStart < nStart) {
    fragments.push(new Note(existingNote.pitch, eStart, nStart - eStart))
  }

  if (nEnd < eEnd) {
    fragments.push(new Note(existingNote.pitch, nEnd, eEnd - nEnd))
  }

  return fragments
}

export const applyNotesToComposition = (
  composition: Note[],
  newNotes: Note[]
): Note[] => {
  let result = [...composition]

  for (const newNote of newNotes) {
    const conflicts = result.filter((note) => notesOverlap(note, newNote))
    const fragments = conflicts.flatMap((conflict) => splitNoteByConflict(conflict, newNote))

    result = result.filter((note) => !conflicts.includes(note))
    result.push(...fragments, newNote)
  }

  return result
}
