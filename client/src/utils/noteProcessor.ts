import { Note, WHITE_NOTES, GRID_COLS, GRID_ROWS, type WhiteNote } from '../types'

export interface GridCell {
  col: number
  row: number
}

export type StrokePoint = readonly [number, number]
export type Stroke = StrokePoint[]

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

export const gridCellToNote = (col: number, row: number): Note => {
  const pitch = WHITE_NOTES[row] as WhiteNote
  return new Note(pitch, col / GRID_COLS, 1 / GRID_COLS)
}

export const extractGridCells = (
  stroke: Stroke,
  canvasWidth: number,
  canvasHeight: number
): GridCell[] => {
  const cellSet = new Set<string>()

  for (const [x, y] of stroke) {
    const { col, row } = pointToGridCell(x, y, canvasWidth, canvasHeight)
    cellSet.add(`${col},${row}`)
  }

  return Array.from(cellSet).map((cell) => {
    const [col, row] = cell.split(',').map(Number)
    return { col, row }
  })
}

export const mergeAdjacentNotes = (notes: Note[]): Note[] => {
  if (notes.length === 0) return []

  const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime)
  const merged: Note[] = []
  let currentGroup = [sortedNotes[0]]

  for (let i = 1; i < sortedNotes.length; i++) {
    const prev = sortedNotes[i - 1]
    const current = sortedNotes[i]

    const prevEnd = prev.startTime + prev.duration
    const isAdjacent = Math.abs(prevEnd - current.startTime) < 0.001
    const isSamePitch = prev.pitch === current.pitch

    if (isAdjacent && isSamePitch) {
      currentGroup.push(current)
    } else {
      merged.push(mergeGroup(currentGroup))
      currentGroup = [current]
    }
  }

  merged.push(mergeGroup(currentGroup))
  return merged
}

const mergeGroup = (group: Note[]): Note => {
  const totalDuration = group.reduce((sum, note) => sum + note.duration, 0)
  return new Note(group[0].pitch, group[0].startTime, totalDuration)
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

export const quantizeStroke = (
  stroke: Stroke,
  canvasWidth: number,
  canvasHeight: number
): Note[] => {
  const cells = extractGridCells(stroke, canvasWidth, canvasHeight)
  const notes = cells.map(({ col, row }) => gridCellToNote(col, row))
  return mergeAdjacentNotes(notes)
}