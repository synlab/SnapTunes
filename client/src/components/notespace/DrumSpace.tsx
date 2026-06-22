import { useState, useRef, useEffect, type MouseEvent, type RefObject } from 'react'
import * as ctx from '../../contexts/snaptunestatecontext'
import {Drum, GRID_COLS, Note } from '../../types'
interface DrumSpaceProps {
  progressRef: RefObject<number>
}

interface Track {
  label: string
  color: string
}

const TRACKS: Track[] = [
  { label: 'Kick', color: '#cc4410' },
  { label: 'Snare', color: '#7a9a10' },
  { label: 'Hi-Hat', color: '#6655cc' },
  { label: 'Clap', color: '#4c66cf' },
]

const STEPS = GRID_COLS
const STEPS_PER_MEASURE = STEPS/2

function createEmptyGrid(): boolean[][] {
  //TODO: Add grid construction from existing drums composition
  return TRACKS.map(() => Array(STEPS).fill(false))
}

export function DrumSpace({ progressRef }: DrumSpaceProps) {

  const {setDrumsComposition } = ctx.useUpdateDrumsComposition();

  const [grid, setGrid] = useState<boolean[][]>(createEmptyGrid)
  const [mouseDownStep, setMouseDownStep] = useState<boolean | null>(null)
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const animRef = useRef<number | null>(null)

  // Poll progressRef on every animation frame to update the highlighted step
  useEffect(() => {
    const tick = () => {
      if (progressRef?.current != null) {
        const step = Math.floor(progressRef.current * STEPS)
        setCurrentStep(step < STEPS ? step : null)
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)

    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current)
      }
    }
  }, [progressRef])

  //Rebuild drums composition from boolean grid
  useEffect(()=>{
    let newComposition: Note[] = [];
    for(let i=0; i<grid.length; i++){
      for(let j=0; j<grid[i].length; j++){
        if(grid[i][j]){
          newComposition.push(new Note(Object.values(Drum)[i], j/grid[i].length , 1/STEPS))
        }
      }
    }
    console.log(newComposition)
    setDrumsComposition(newComposition);
  }, [grid])

  const toggleStep = (trackIdx: number, stepIdx: number, forceValue?: boolean): void => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row])
      next[trackIdx][stepIdx] = forceValue ?? !prev[trackIdx][stepIdx]
      return next
    })
  }

  // Allow click-drag to paint/erase multiple steps
  const handleMouseDown = (trackIdx: number, stepIdx: number): void => {
    const newVal = !grid[trackIdx][stepIdx]
    setMouseDownStep(newVal)
    toggleStep(trackIdx, stepIdx, newVal)
  }

  const handleMouseEnter = (
    trackIdx: number,
    stepIdx: number,
    event: MouseEvent<HTMLDivElement>
  ): void => {
    if (event.buttons !== 1 || mouseDownStep === null) return
    toggleStep(trackIdx, stepIdx, mouseDownStep)
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#ffffff',
        border: '1px solid #999',
        borderRadius: '8px',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onMouseUp={() => setMouseDownStep(null)}
      onMouseLeave={() => setMouseDownStep(null)}
    >
      <div
        style={{
          width: '100px',
          flexShrink: 0,
          borderRight: '2px solid #999',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
        }}
      >
        {TRACKS.map((track, index) => (
          <div
            key={track.label}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: '12px',
              borderBottom: index < TRACKS.length - 1 ? '1px solid #ccc' : 'none',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: '600',
                color: track.color,
              }}
            >
              {track.label}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '6px',
          gap: '6px',
        }}
      >
        {TRACKS.map((track, trackIdx) => (
          <div
            key={track.label}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'stretch',
              gap: '4px',
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: `repeat(${STEPS_PER_MEASURE}, 1fr)`,
                gap: '4px',
              }}
            >
              {Array.from({ length: STEPS_PER_MEASURE }).map((_, stepIdx) => {
                const active = grid[trackIdx][stepIdx]
                const isCurrentStep = currentStep === stepIdx
                return (
                  <div
                    key={stepIdx}
                    onMouseDown={() => handleMouseDown(trackIdx, stepIdx)}
                    onMouseEnter={(event) => handleMouseEnter(trackIdx, stepIdx, event)}
                    style={{
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background:
                        isCurrentStep && active
                          ? track.color
                          : isCurrentStep
                            ? '#c8d4f5'
                            : active
                              ? track.color
                              : stepIdx % 2 === 0
                                ? '#f0f0f0'
                                : '#e4e4e4',
                      outlineOffset: '-2px',
                      boxShadow: active ? `0 0 6px ${track.color}88` : 'none',
                      border: active ? `1px solid ${track.color}` : '1px solid #ccc',
                      transition: 'background 0.08s, box-shadow 0.08s',
                    }}
                  />
                )
              })}
            </div>

            <div
              style={{
                width: '2px',
                flexShrink: 0,
                background: '#999',
                borderRadius: '2px',
                margin: '2px 0',
              }}
            />

            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: `repeat(${STEPS_PER_MEASURE}, 1fr)`,
                gap: '4px',
              }}
            >
              {Array.from({ length: STEPS_PER_MEASURE }).map((_, stepIdx) => {
                const absoluteIdx = stepIdx + STEPS_PER_MEASURE
                const active = grid[trackIdx][absoluteIdx]
                const isCurrentStep = currentStep === absoluteIdx
                return (
                  <div
                    key={stepIdx}
                    onMouseDown={() => handleMouseDown(trackIdx, absoluteIdx)}
                    onMouseEnter={(event) => handleMouseEnter(trackIdx, absoluteIdx, event)}
                    style={{
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background:
                        isCurrentStep && active
                          ? track.color
                          : isCurrentStep
                            ? '#c8d4f5'
                            : active
                              ? track.color
                              : stepIdx % 2 === 0
                                ? '#f0f0f0'
                                : '#e4e4e4',
                      boxShadow: active ? `0 0 6px ${track.color}88` : 'none',
                      border: active ? `1px solid ${track.color}` : '1px solid #ccc',
                      transition: 'background 0.08s, box-shadow 0.08s',
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}