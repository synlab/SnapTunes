import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { IconButton, Tooltip, Slider } from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import VolumeDownRoundedIcon from '@mui/icons-material/VolumeDownRounded'
import UndoRoundedIcon from '@mui/icons-material/UndoRounded'
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded'
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import AllInclusiveRoundedIcon from '@mui/icons-material/AllInclusiveRounded'
import * as ctx from '../../contexts/snaptunestatecontext'
import './TopBar.css'

import { MdOutlinePiano } from 'react-icons/md'
import { LuGuitar } from 'react-icons/lu'
import { FaRegBell } from 'react-icons/fa'
import { LiaDrumSolid } from 'react-icons/lia'
import { Instrument, INSTRUMENT_THEMES } from '../../types'

interface TopBarProps {
  volume: number,
  setVolume: React.Dispatch<React.SetStateAction<number>>
  displayedBpm: number
  bpmSliderDisabled: boolean
  groupedControlsDisabled: boolean
  loopEnabled: boolean
  onBpmEditBegin: () => void
  onBpmChange: (value: number) => void
  onBpmEditEnd: () => void
  onPlayPause: () => Promise<void>
  onStop: () => void
  onToggleLoop: () => void
}

interface InstrumentPreset {
  label: Instrument
  icon: ReactNode
}

const sliderSharedSx = {
  width: '140px',
  color: '#000',
  '& .MuiSlider-thumb': { width: 12, height: 12, backgroundColor: '#4c66cf' },
  '& .MuiSlider-track': { backgroundColor: '#4c66cf', border: 'none' },
  '& .MuiSlider-rail': { backgroundColor: '#fff' },
}

const bpmSliderSx = {
  ...sliderSharedSx,
  '& .Mui-disabled': { color: '#d2d2d2' },
}

const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { label: Instrument.Piano, icon: <MdOutlinePiano /> },
  { label: Instrument.Guitar, icon: <LuGuitar /> },
  { label: Instrument.Bells, icon: <FaRegBell /> },
  { label: Instrument.Drums, icon: <LiaDrumSolid fontSize="28px" /> },
]

export function TopBar({ volume, setVolume, displayedBpm, bpmSliderDisabled, groupedControlsDisabled, loopEnabled, onBpmEditBegin, onBpmChange, onBpmEditEnd, onPlayPause, onStop, onToggleLoop }: TopBarProps) {
  const { playback } = ctx.usePlayback()
  const { setUndo } = ctx.useUpdateUndo()

  const { instrument } = ctx.useInstrument()
  const { setInstrument } = ctx.useUpdateInstrument()

  const [prevVolume, setPrevVolume] = useState<number>(-20)
  const activeInstrument = instrument ?? Instrument.Piano

  const isMuted = volume === -40 //When reaching currentDeviceVolume - 40db, we mute
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  //Fullscreen handler
  const toggleFullscreen = (): void => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((error: Error) => console.error(`Erreur : ${error.message}`))
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleMute = (): void => {
    if (isMuted) {
      setVolume(prevVolume || -25)
    } else {
      setPrevVolume(volume)
      setVolume(-40)
    }
  }

  const VolumeIcon = isMuted
    ? VolumeOffRoundedIcon
    : volume < -25
      ? VolumeDownRoundedIcon
      : VolumeUpRoundedIcon

  // Show the current playback state, not the last command:
  // playing -> pause icon, paused/stopped -> play icon.
  const PlaybackButton = playback === 1 ? PauseRoundedIcon : PlayArrowRoundedIcon

  const handleVolumeChange = (_event: Event, value: number | number[]): void => {
    setVolume(Array.isArray(value) ? value[0] : value)
  }
  const handleBPMChange = (_event: Event, value: number | number[]): void => {
    if (bpmSliderDisabled) return
    onBpmChange(Array.isArray(value) ? value[0] : value)
  }

  const handleBpmEditBegin = (): void => {
    if (bpmSliderDisabled) return
    onBpmEditBegin()
  }

  const handleBpmEditEnd = (): void => {
    onBpmEditEnd()
  }

  const handleInstrumentPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    targetInstrument: Instrument,
  ): void => {
    if (event.pointerType === 'mouse') return
    setInstrument(targetInstrument)
  }


  return (
    <div className="topbar-grid">
      <div className="topbar-cell topbar-volume-cell">
        <Tooltip title={isMuted ? 'Unmute' : 'Mute'} placement="bottom">
          <IconButton className="topbar-button" onClick={toggleMute}>
            <VolumeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Slider
          value={volume}
          onChange={handleVolumeChange}
          min={-40}
          max={0}
          size="small"
          sx={sliderSharedSx}
        />
      </div>
      <div className="topbar-cell">
        <div className="topbar-instrument-group">
        {INSTRUMENT_PRESETS.map((inst) => {
          const theme = INSTRUMENT_THEMES[inst.label]
          const isActive = activeInstrument === inst.label
          const activeBg = `rgb(${theme.softRgb.join(', ')})`
          const instrumentStyle = {
            '--instrument-color': theme.hex,
            '--instrument-active-bg': activeBg,
          } as CSSProperties

          return (
            <div key={inst.label} className="topbar-instrument-item">
              {inst.label === Instrument.Drums && (
                <div className="topbar-instrument-divider" />
              )}
              <Tooltip title={inst.label} placement="bottom" >
                <IconButton
                  onPointerDown={(event) => handleInstrumentPointerDown(event, inst.label)}
                  onClick={() => setInstrument(inst.label)}
                  className={`topbar-button topbar-instrument-button ${isActive ? 'topbar-instrument-button-active' : ''}`}
                  style={instrumentStyle}
                >
                  {inst.icon}
                </IconButton>
              </Tooltip>
            </div>
          )
        })}
        </div>
      </div>
      <div className="topbar-cell">
        <Tooltip title={loopEnabled ? 'Loop on' : 'Loop off'} placement="bottom">
          <IconButton
            className={`topbar-button ${loopEnabled ? 'topbar-button-active' : ''}`}
            onClick={onToggleLoop}
          >
            <AllInclusiveRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="topbar-cell topbar-transport-cell">
        <Tooltip title={groupedControlsDisabled ? 'Waiting for server sync...' : 'Play'} placement="bottom">
          <IconButton
            className="topbar-button"
            disabled={groupedControlsDisabled}
            onClick={onPlayPause}
          >
            <PlaybackButton />
          </IconButton>
        </Tooltip>
        <Tooltip title={groupedControlsDisabled ? 'Waiting for server sync...' : 'Stop'} placement="bottom">
          <IconButton className="topbar-button" disabled={groupedControlsDisabled} onClick={onStop}>
            <StopRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>

      </div>

      <div className="topbar-cell">
        {instrument !== 'drums' && (
          <Tooltip title="undo" placement="top">
            <IconButton onClick={() => setUndo(true)} className="topbar-button">
              <UndoRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <div className="topbar-cell topbar-bpm-cell">
        <div className="topbar-bpm-display">
          <span className="topbar-bpm-value">{displayedBpm}</span>
          <span className="topbar-bpm-label">
            BPM
          </span>
        </div>

        <Slider
          value={displayedBpm}
          onMouseDown={handleBpmEditBegin}
          onTouchStart={handleBpmEditBegin}
          onMouseUp={handleBpmEditEnd}
          onTouchEnd={handleBpmEditEnd}
          onChange={handleBPMChange}
          onChangeCommitted={handleBpmEditEnd}
          min={60}
          max={200}
          step={5}
          size="small"
          disabled={bpmSliderDisabled}
          sx={{
            ...bpmSliderSx,
            opacity: bpmSliderDisabled ? 0.55 : 1,
            '& .MuiSlider-thumb': {
              width: 12,
              height: 12,
              backgroundColor: bpmSliderDisabled ? '#7c7c7c' : '#4c66cf',
            },
            '& .MuiSlider-track': {
              backgroundColor: bpmSliderDisabled ? '#7c7c7c' : '#4c66cf',
              border: 'none',
            },
            '& .MuiSlider-rail': {
              backgroundColor: bpmSliderDisabled ? '#dfdfdf' : '#fff',
            },
          }}
        />
      </div>
      <div className="topbar-cell">
        <Tooltip title="Fullscreen" placement="bottom">
          <IconButton className="topbar-button" onClick={toggleFullscreen}>
            {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </div>
    </div>
  )
}