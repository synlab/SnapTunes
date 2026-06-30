import { GRID_COLS } from '../types'

export const getCompositionDurationSec = (targetBpm: number): number => {
  return (GRID_COLS / targetBpm) * 60
}

export const getCompositionDurationMs = (targetBpm: number): number => {
  return getCompositionDurationSec(targetBpm) * 1000
}

export const generateRequestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
