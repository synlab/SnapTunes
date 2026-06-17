import { useState, useRef, useEffect } from 'react'
import { IconButton, Tooltip, Slider } from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import VolumeDownRoundedIcon from '@mui/icons-material/VolumeDownRounded'
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded'
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded'
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/Fullscreen';
import * as ctx from '../../contexts/snaptunestatecontext'

import { PiMetronome } from "react-icons/pi";

import { MdOutlinePiano } from "react-icons/md";
import { LuFullscreen, LuGuitar } from "react-icons/lu";
import { FaRegBell } from "react-icons/fa";
import { LiaDrumSolid } from "react-icons/lia";

const buttonStyle = {
  color: 'rgb(76, 102, 207)',
  backgroundColor: '#fff',
  borderRadius: '6px',
  padding: '6px',
  '&:hover': { backgroundColor: '#f0f0f0' },
}

const playButtonStyle = {
  ...buttonStyle,
  padding: '8px',
}

const INSTRUMENT_PRESETS = [
  { label: 'Piano', icon: <MdOutlinePiano/> },
  { label: 'Guitar', icon: <LuGuitar/> },
  { label: 'Bells', icon: <FaRegBell/> },
  { label: 'Percussion', icon: <LiaDrumSolid fontSize="28px"/> },
]

export function TopBar() {
  const { playback } = ctx.usePlayback()
  const { setPlayback } = ctx.useUpdatePlayback()

  const { instrument } = ctx.useInstrument()
  const { setInstrument } = ctx.useUpdateInstrument()

  const [volume, setVolume] = useState(75)
  const [prevVolume, setPrevVolume] = useState(75)
  const [instrumentMenuOpen, setInstrumentMenuOpen] = useState(false)
  const [activeInstrument, setActiveInstrument] = useState(0)
  const instrumentRef = useRef(null)

  const isMuted = volume === 0

  // BPM state (can be made editable later)
  const bpm = 60

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Gère l'action du bouton de bascule
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      // Demande le plein écran sur l'élément référencé
      document.documentElement.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => console.error(`Erreur : ${err.message}`));
    } else {
      // Quitte le plein écran (s'applique toujours au document)
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Écoute les changements (ex: si l'utilisateur appuie sur la touche Échap)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleMute = () => {
    if (isMuted) {
      setVolume(prevVolume || 75)
    } else {
      setPrevVolume(volume)
      setVolume(0)
    }
  }

  // Close menu when clicking outside
  useEffect(() => {
    if (!instrumentMenuOpen) return
    const handleClickOutside = (e) => {
      if (instrumentRef.current && !instrumentRef.current.contains(e.target)) {
        setInstrumentMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [instrumentMenuOpen])

  const VolumeIcon = isMuted
    ? VolumeOffRoundedIcon
    : volume < 50
    ? VolumeDownRoundedIcon
    : VolumeUpRoundedIcon

  const PlaybackButton = playback === 2
    ? PauseRoundedIcon
    : PlayArrowRoundedIcon

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      height: '100%',
      background: '#86a7e1',
      borderRadius: '8px',
      padding: '0 16px',
      boxSizing: 'border-box',
    }}>

      {/* Left — volume + BPM display */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Tooltip title={isMuted ? 'Unmute' : 'Mute'} placement="bottom">
            <IconButton sx={buttonStyle} onClick={toggleMute}>
              <VolumeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Slider
            value={volume}
            onChange={(_, val) => setVolume(val)}
            min={0}
            max={100}
            size="small"
            sx={{
              width: '90px',
              color: '#000',
              '& .MuiSlider-thumb': { width: 12, height: 12, backgroundColor: '#4c66cf' },
              '& .MuiSlider-track': { backgroundColor: '#4c66cf', border: 'none' },
              '& .MuiSlider-rail': { backgroundColor: '#fff' },
            }}
          />
        </div>

        {/* BPM read-only display */}
        <div style={{
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
        }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>
            {bpm}
          </span>
          <span style={{ fontSize: '12px', color: '#fff', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            BPM
          </span>
        </div>

        {/* Metronome Button */}
        <Tooltip title="Metronome" placement="bottom">
          <IconButton sx={playButtonStyle} onClick={() => {}}>
            <PiMetronome fontSize='25px'/>
          </IconButton>
        </Tooltip>

        {/* Instrument Selection + side popout */}
        <div ref={instrumentRef} style={{ position: 'relative' }}>
          <Tooltip title="Instruments" placement="bottom">
            <IconButton
              sx={{
                ...playButtonStyle,
                backgroundColor: instrumentMenuOpen ? '#e0e0e0' : '#fff',
              }}
              onClick={() => setInstrumentMenuOpen(o => !o)}
            >
              {INSTRUMENT_PRESETS[activeInstrument].icon}
            </IconButton>
          </Tooltip>

          {/* Side popout menu */}
          {instrumentMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: 'calc(100% + 8px)',
              transform: 'translateY(-50%)',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              flexDirection: 'row',
              gap: '4px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              zIndex: 100,
              // small arrow pointing left back toward the button
              '&::before': {
                content: '""',
                position: 'absolute',
                right: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                borderWidth: '6px',
                borderStyle: 'solid',
                borderColor: 'transparent #ddd transparent transparent',
              }
            }}>
              {/* Arrow notch) */}
              <div style={{
                position: 'absolute',
                right: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderRight: '7px solid #ddd',
              }} />
              <div style={{
                position: 'absolute',
                right: 'calc(100% - 1px)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderRight: '7px solid #fff',
              }} />

              {INSTRUMENT_PRESETS.map((inst, i) => (
                <Tooltip key={i} title={inst.label} placement="bottom">
                  <IconButton
                    onClick={() => {
                      setActiveInstrument(i)
                      setInstrumentMenuOpen(false)
                      setInstrument(i)
                    }}
                    sx={{
                      color: '#4c66cf',
                      backgroundColor: activeInstrument === i ? '#4c66cf' : '#f5f5f5',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      transition: 'all 0.15s',
                      '& svg': {
                        color: activeInstrument === i ? '#fff' : '#4c66cf',
                      },
                      '&:hover': {
                        backgroundColor: activeInstrument === i ? '#222' : '#e8e8e8',
                      },
                    }}
                  >
                    {inst.icon}
                  </IconButton>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Middle — transport controls */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <Tooltip title="Play" placement="bottom">
          <IconButton sx={playButtonStyle} onClick={() => {
            if (playback === 1) setPlayback(2)
            else setPlayback(1)
            }}>
            <PlaybackButton />
          </IconButton>
        </Tooltip>
        <Tooltip title="Stop" placement="bottom">
          <IconButton sx={buttonStyle} onClick={() => setPlayback(0)}>
            <StopRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      {/* Right — save, export, settings */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Tooltip title="Save" placement="bottom">
          <IconButton sx={buttonStyle} onClick={() => {}}>
            <SaveRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export" placement="bottom">
          <IconButton sx={buttonStyle} onClick={() => {}}>
            <FileUploadRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings" placement="bottom">
          <IconButton sx={buttonStyle} onClick={() => {}}>
            <SettingsRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings" placement="bottom">
          <IconButton sx={buttonStyle} onClick={toggleFullscreen}>
            {isFullscreen ?
             <FullscreenIcon fontSize="small" /> :
              <FullscreenExitIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </div>

    </div>
  )
}