import { Note, WHITE_NOTES, GRID_COLS, GRID_ROWS } from '../types'

/**
 * Note processing utilities for quantization and conflict handling
 */


/**
 * Evaluate if a point (x,y) is inside a relative rectangle zone
 */
export const isInsideRelativeElementPosition = (x, y, width, height) => {
    return x > 0 && x < width && y > 0 && y < height
}

/**
 * Converts a stroke point to grid coordinates
 */
export const pointToGridCell = (x, y, canvasWidth, canvasHeight) => {
  const cellWidth = canvasWidth / GRID_COLS
  const cellHeight = canvasHeight / GRID_ROWS
  
  const col = Math.floor(x / cellWidth)
  const row = Math.floor(y / cellHeight)
  
  return {
    col: Math.max(0, Math.min(col, GRID_COLS - 1)),
    row: Math.max(0, Math.min(row, GRID_ROWS - 1)),
  }
}

/**
 * Converts grid cell to Note object
 */
export const gridCellToNote = (col, row) => {
  const pitch = WHITE_NOTES[row]
  return new Note(pitch, col / GRID_COLS, 1 / GRID_COLS)
}

/**
 * Extracts unique grid cells from stroke points
 */
export const extractGridCells = (stroke, canvasWidth, canvasHeight) => {
  const cellSet = new Set()
  
  for (const [x, y] of stroke) {
    const { col, row } = pointToGridCell(x, y, canvasWidth, canvasHeight)
    cellSet.add(`${col},${row}`)
  }
  
  return Array.from(cellSet).map(cell => {
    const [col, row] = cell.split(',').map(Number)
    return { col, row }
  })
}

/**
 * Merges adjacent notes with same pitch
 */
export const mergeAdjacentNotes = (notes) => {
  if (notes.length === 0) return []

  const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime)
  const merged = []
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

/**
 * Merges a group of notes into a single note
 */
const mergeGroup = (group) => {
  const totalDuration = group.reduce((sum, note) => sum + note.duration, 0)
  return new Note(group[0].pitch, group[0].startTime, totalDuration)
}

/**
 * Checks if two notes overlap in time and have same pitch
 */
export const notesOverlap = (note1, note2) => {
  if (note1.pitch !== note2.pitch) return false
  
  const end1 = note1.startTime + note1.duration
  const end2 = note2.startTime + note2.duration
  
  return note1.startTime < end2 && note2.startTime < end1
}

/**
 * Splits an existing note by a conflicting new note
 * Returns remaining parts (0, 1, or 2 parts)
 */
export const splitNoteByConflict = (existingNote, newNote) => {
  const eStart = existingNote.startTime
  const eEnd = eStart + existingNote.duration
  const nStart = newNote.startTime
  const nEnd = nStart + newNote.duration

  const fragments = []

  // Left fragment
  if (eStart < nStart) {
    fragments.push(
      new Note(existingNote.pitch, eStart, nStart - eStart)
    )
  }

  // Right fragment
  if (nEnd < eEnd) {
    fragments.push(
      new Note(existingNote.pitch, nEnd, eEnd - nEnd)
    )
  }

  return fragments
}

/**
 * Applies new notes to composition, handling conflicts
 */
export const applyNotesToComposition = (composition, newNotes) => {
  let result = [...composition]

  for (const newNote of newNotes) {
    // Find conflicting notes
    const conflicts = result.filter(note => notesOverlap(note, newNote))
    
    // Collect fragments from split notes
    const fragments = conflicts.flatMap(conflict =>
      splitNoteByConflict(conflict, newNote)
    )

    // Remove conflicting notes and add fragments + new note
    result = result.filter(note => !conflicts.includes(note))
    result.push(...fragments, newNote)
  }

  return result
}

/**
 * Quantizes a stroke into merged notes
 */
export const quantizeStroke = (stroke, canvasWidth, canvasHeight) => {
  const cells = extractGridCells(stroke, canvasWidth, canvasHeight)
  const notes = cells.map(({ col, row }) => gridCellToNote(col, row))
  return mergeAdjacentNotes(notes)
}
