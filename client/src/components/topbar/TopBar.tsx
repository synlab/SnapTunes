import { useEffect, useState, type ReactNode } from 'react'
import { IconButton, Tooltip, Slider } from '@mui/material'
import * as Tone from 'tone';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import VolumeDownRoundedIcon from '@mui/icons-material/VolumeDownRounded'
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded'
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/Fullscreen'
import * as ctx from '../../contexts/snaptunestatecontext'

import { PiMetronome } from 'react-icons/pi'
import { MdOutlinePiano } from 'react-icons/md'
import { LuGuitar } from 'react-icons/lu'
import { FaRegBell } from 'react-icons/fa'
import { LiaDrumSolid } from 'react-icons/lia'
import { Instrument, INSTRUMENT_THEMES } from '../../types'

interface TopBarProps {
  volume: number,
  setVolume: React.Dispatch<React.SetStateAction<number>>
}

interface InstrumentPreset {
  label: Instrument
  icon: ReactNode
}

const buttonStyle = {
  color: '#4c66cf',
  backgroundColor: '#fff',
  borderRadius: '6px',
  padding: '6px',
  '&:hover': { backgroundColor: '#f0f0f0' },
}

const playButtonStyle = {
  ...buttonStyle,
  padding: '8px',
}

const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { label: Instrument.Piano, icon: <MdOutlinePiano /> },
  { label: Instrument.Guitar, icon: <LuGuitar /> },
  { label: Instrument.Bells, icon: <FaRegBell /> },
  { label: Instrument.Drums, icon: <LiaDrumSolid fontSize="28px" /> },
]

export function TopBar({ volume, setVolume }: TopBarProps) {
  const { playback } = ctx.usePlayback()
  const { setPlayback } = ctx.useUpdatePlayback()

  const { bpm } = ctx.useBPM()
  const { setBPM } = ctx.useUpdateBPM()

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

  const PlaybackButton = playback === 2 ? PauseRoundedIcon : PlayArrowRoundedIcon

  const handleVolumeChange = (_event: Event, value: number | number[]): void => {
    setVolume(Array.isArray(value) ? value[0] : value)
  }
  const handleBPMChange = (_event: Event, value: number | number[]): void => {
    setBPM(Array.isArray(value) ? value[0] : value)
  }

  const handleInstrumentPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    targetInstrument: Instrument,
  ): void => {
    if (event.pointerType === 'mouse') return
    setInstrument(targetInstrument)
  }


  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        background: '#86a7e1',
        borderRadius: '8px',
        padding: '0 16px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Tooltip title={isMuted ? 'Unmute' : 'Mute'} placement="bottom">
            <IconButton sx={buttonStyle} onClick={toggleMute}>
              <VolumeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Slider
            value={volume}
            onChange={handleVolumeChange}
            min={-40}
            max={0}
            size="small"
            sx={{
              width: '140px',
              color: '#000',
              '& .MuiSlider-thumb': { width: 12, height: 12, backgroundColor: '#4c66cf' },
              '& .MuiSlider-track': { backgroundColor: '#4c66cf', border: 'none' },
              '& .MuiSlider-rail': { backgroundColor: '#fff' },
            }}
          />
        </div>



        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid rgba(0, 0, 0, 0.12)',
          }}
        >
          {INSTRUMENT_PRESETS.map((inst) => {
            const theme = INSTRUMENT_THEMES[inst.label]
            const isActive = activeInstrument === inst.label
            const activeBg = `rgb(${theme.softRgb.join(', ')})`

            return (
              <div key={inst.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {inst.label === Instrument.Drums && (
                  <div
                    style={{
                      width: '2px',
                      height: '30px',
                      background: '#d1d1d1',
                      margin: '0 2px',
                    }}
                  />
                )}
                <Tooltip title={inst.label} placement="bottom" >
                  <IconButton
                    onPointerDown={(event) => handleInstrumentPointerDown(event, inst.label)}
                    onClick={() => setInstrument(inst.label)}
                    sx={{
                      color: isActive ? theme.hex : '#8f8f8f',
                      backgroundColor: isActive ? activeBg : '#efefef',
                      borderRadius: '8px',
                      border: isActive ? `2px solid ${theme.hex}` : '2px solid transparent',
                      width: '42px',
                      height: '42px',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        backgroundColor: isActive ? activeBg : '#e3e3e3',
                      },
                      '&.Mui-focusVisible': {
                        backgroundColor: isActive ? activeBg : '#efefef',
                      },
                      '&:active': {
                        backgroundColor: isActive ? activeBg : '#e3e3e3',
                      },
                      '& svg': {
                        color: isActive ? theme.hex : '#8f8f8f',
                      },
                    }}
                  >
                    {inst.icon}
                  </IconButton>
                </Tooltip>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <Tooltip title="Play" placement="bottom">
          <IconButton
            sx={playButtonStyle}
            onClick={async () => {
              await Tone.start();
              if (playback === 1) setPlayback(2)
              else setPlayback(1)
            }}
          >
            <PlaybackButton />
          </IconButton>
        </Tooltip>
        <Tooltip title="Stop" placement="bottom">
          <IconButton sx={buttonStyle} onClick={() => setPlayback(0)}>
            <StopRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#86a7e1',
            borderRadius: '6px',
            padding: '2px 10px',
            height: '36px',
            lineHeight: 1,
            minWidth: '48px',
          }}
        >
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>{bpm}</span>
          <span style={{ fontSize: '12px', color: '#fff', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            BPM
          </span>
        </div>

        <Slider
          value={bpm}
          onChange={handleBPMChange}
          min={30}
          max={200}
          step={5}
          size="small"
          sx={{
            width: '140px',
            color: '#000',
            '& .MuiSlider-thumb': { width: 12, height: 12, backgroundColor: '#4c66cf' },
            '& .MuiSlider-track': { backgroundColor: '#4c66cf', border: 'none' },
            '& .MuiSlider-rail': { backgroundColor: '#fff' },
          }}
        />
      </div>
      <Tooltip title="Fullscreen" placement="bottom">
        <IconButton sx={buttonStyle} onClick={toggleFullscreen}>
          {isFullscreen ? <FullscreenIcon fontSize="small" /> : <FullscreenExitIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </div>
  )
}