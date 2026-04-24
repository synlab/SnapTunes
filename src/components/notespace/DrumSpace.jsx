// DrumSpace.jsx
import { useState, useRef, useEffect } from 'react'

const TRACKS = [
  { label: 'Kick',   color: '#cc4410' },  // low octave orange-red
  { label: 'Snare',  color: '#7a9a10' },  // middle octave yellow-green
  { label: 'Hi-Hat', color: '#6655cc' },  // high octave blue-purple
  { label: 'Clap',   color: '#4c66cf' },  // accent blue
]

const STEPS = 16
const STEPS_PER_MEASURE = 8

function createEmptyGrid() {
  return TRACKS.map(() => Array(STEPS).fill(false))
}

export function DrumSpace({ progressRef }) {
  const [grid, setGrid] = useState(createEmptyGrid)
  const [mouseDownStep, setMouseDownStep] = useState(null)
  const [currentStep, setCurrentStep] = useState(null)
  const animRef = useRef(null)

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
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  const toggleStep = (trackIdx, stepIdx, forceValue) => {
    setGrid(prev => {
      const next = prev.map(row => [...row])
      next[trackIdx][stepIdx] = forceValue ?? !prev[trackIdx][stepIdx]
      return next
    })
  }

  // Allow click-drag to paint/erase multiple steps
  const handleMouseDown = (trackIdx, stepIdx) => {
    const newVal = !grid[trackIdx][stepIdx]
    setMouseDownStep(newVal)
    toggleStep(trackIdx, stepIdx, newVal)
  }

  const handleMouseEnter = (trackIdx, stepIdx, e) => {
    if (e.buttons !== 1 || mouseDownStep === null) return
    toggleStep(trackIdx, stepIdx, mouseDownStep)
  }

  return (
    <div style={{
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
      {/* Track labels */}
      <div style={{
        width: '100px',
        flexShrink: 0,
        borderRight: '2px solid #999',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
      }}>
        {TRACKS.map((track, i) => (
          <div key={track.label} style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '12px',
            borderBottom: i < TRACKS.length - 1 ? '1px solid #ccc' : 'none',
          }}>
            <span style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              fontWeight: '600',
              color: track.color,
            }}>
              {track.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step grid */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '6px',
        gap: '6px',
      }}>
        {TRACKS.map((track, trackIdx) => (
          <div key={track.label} style={{
            flex: 1,
            display: 'flex',
            alignItems: 'stretch',
            gap: '4px',
          }}>
            {/* Measure 1 */}
            <div style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: `repeat(${STEPS_PER_MEASURE}, 1fr)`,
              gap: '4px',
            }}>
              {Array.from({ length: STEPS_PER_MEASURE }).map((_, stepIdx) => {
                const active = grid[trackIdx][stepIdx]
                const isCurrentStep = currentStep === stepIdx
                return (
                  <div
                    key={stepIdx}
                    onMouseDown={() => handleMouseDown(trackIdx, stepIdx)}
                    onMouseEnter={(e) => handleMouseEnter(trackIdx, stepIdx, e)}
                    style={{
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: isCurrentStep && active
                        ? track.color        // active + current: full colour
                        : isCurrentStep
                        ? '#c8d4f5'          // current but inactive: light blue pulse
                        : active
                        ? track.color        // active: full colour
                        : stepIdx % 2 === 0
                        ? '#f0f0f0'
                        : '#e4e4e4',         // inactive: alternating grey
                      outlineOffset: '-2px',
                      boxShadow: active ? `0 0 6px ${track.color}88` : 'none',
                      border: active ? `1px solid ${track.color}` : '1px solid #ccc',
                      transition: 'background 0.08s, box-shadow 0.08s',
                    }}
                  />
                )
              })}
            </div>

            {/* Measure divider */}
            <div style={{
              width: '2px',
              flexShrink: 0,
              background: '#999',
              borderRadius: '2px',
              margin: '2px 0',
            }} />

            {/* Measure 2 */}
            <div style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: `repeat(${STEPS_PER_MEASURE}, 1fr)`,
              gap: '4px',
            }}>
              {Array.from({ length: STEPS_PER_MEASURE }).map((_, stepIdx) => {
                const absoluteIdx = stepIdx + STEPS_PER_MEASURE
                const active = grid[trackIdx][absoluteIdx]
                const isCurrentStep = currentStep === absoluteIdx
                return (
                  <div
                    key={stepIdx}
                    onMouseDown={() => handleMouseDown(trackIdx, absoluteIdx)}
                    onMouseEnter={(e) => handleMouseEnter(trackIdx, absoluteIdx, e)}
                    style={{
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: isCurrentStep && active
                        ? track.color        // active + current: full colour
                        : isCurrentStep
                        ? '#c8d4f5'          // current but inactive: light blue pulse
                        : active
                        ? track.color        // active: full colour
                        : stepIdx % 2 === 0
                        ? '#f0f0f0'
                        : '#e4e4e4',         // inactive: alternating grey                      boxShadow: active ? `0 0 6px ${track.color}88` : 'none',
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