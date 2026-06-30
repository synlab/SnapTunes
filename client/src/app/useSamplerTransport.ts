import { useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { Instrument, Note } from '../types'

const INSTRUMENT_SAMPLE_CONFIG: Record<Exclude<Instrument, Instrument.Drums>, { baseUrl: string; urls: Record<string, string> }> = {
  [Instrument.Piano]: {
    baseUrl: 'audio/piano/',
    urls: {
      A3: 'Piano_A3.wav',
      B3: 'Piano_B3.wav',
      C3: 'Piano_C3.wav',
      D3: 'Piano_D3.wav',
      E3: 'Piano_E3.wav',
      F3: 'Piano_F3.wav',
      G3: 'Piano_G3.wav',
    },
  },
  [Instrument.Guitar]: {
    baseUrl: 'audio/guitar/',
    urls: {
      A3: 'guitar_A3.wav',
      B3: 'guitar_B3.wav',
      C3: 'guitar_C3.wav',
      D3: 'guitar_D3.wav',
      E3: 'guitar_E3.wav',
      F3: 'guitar_F3.wav',
      G3: 'guitar_G3.wav',
    },
  },
  [Instrument.Bells]: {
    baseUrl: 'audio/bells/',
    urls: {
      A3: 'bells_A3.wav',
      B3: 'bells_B3.wav',
      C3: 'bells_C3.wav',
      D3: 'bells_D3.wav',
      E3: 'bells_E3.wav',
      F3: 'bells_F3.wav',
      G3: 'bells_G3.wav',
    },
  },
}

const DRUM_SAMPLE_CONFIG = {
  baseUrl: 'audio/drums/',
  urls: {
    B3: 'kick.wav',
    A3: 'snare.wav',
    G3: 'hihat.wav',
    F3: 'clap.wav',
  },
}

const createSampler = (baseUrl: string, urls: Record<string, string>): Tone.Sampler => {
  return new Tone.Sampler({ urls, baseUrl }).toDestination()
}

interface UseSamplerTransportParams {
  instrumentRef: React.MutableRefObject<Instrument | null>
  compositionRef: React.MutableRefObject<Note[]>
  drumsCompositionRef: React.MutableRefObject<Note[]>
  octaveRef: React.MutableRefObject<number>
}

export function useSamplerTransport({
  instrumentRef,
  compositionRef,
  drumsCompositionRef,
  octaveRef,
}: UseSamplerTransportParams) {
  // References to stock instances of Tone.Sampler without triggering re-renders.
  const samplersRef = useRef<Record<Instrument, Tone.Sampler | null>>({
    [Instrument.Piano]: null,
    [Instrument.Guitar]: null,
    [Instrument.Bells]: null,
    [Instrument.Drums]: null,
  })

  useEffect(() => {
    // Piano, guitar, and bells sample banks.
    samplersRef.current[Instrument.Piano] = createSampler(
      INSTRUMENT_SAMPLE_CONFIG[Instrument.Piano].baseUrl,
      INSTRUMENT_SAMPLE_CONFIG[Instrument.Piano].urls,
    )

    samplersRef.current[Instrument.Guitar] = createSampler(
      INSTRUMENT_SAMPLE_CONFIG[Instrument.Guitar].baseUrl,
      INSTRUMENT_SAMPLE_CONFIG[Instrument.Guitar].urls,
    )

    samplersRef.current[Instrument.Bells] = createSampler(
      INSTRUMENT_SAMPLE_CONFIG[Instrument.Bells].baseUrl,
      INSTRUMENT_SAMPLE_CONFIG[Instrument.Bells].urls,
    )

    // Drums map grid rows to fixed sample names on the same octave.
    samplersRef.current[Instrument.Drums] = createSampler(
      DRUM_SAMPLE_CONFIG.baseUrl,
      DRUM_SAMPLE_CONFIG.urls,
    )

    // Clean up when unmount.
    return () => {
      Object.values(samplersRef.current).forEach((sampler) => sampler?.dispose())
    }
  }, [])

  const constructComposition = (totalDuration: number) => {
    Tone.getTransport().cancel()
    const activeInstrument = instrumentRef.current ?? Instrument.Piano
    console.log('current instrument' + activeInstrument)
    const selectedComposition: Note[] =
      activeInstrument === Instrument.Drums ? drumsCompositionRef.current : compositionRef.current

    selectedComposition.forEach((note: Note) => {
      const startTimeSec = note.startTime * totalDuration
      const durationSec = note.duration * totalDuration
      console.log(note.pitch + ': start =' + startTimeSec + ', duration =' + durationSec)

      Tone.getTransport().schedule((time) => {
        const sampler = samplersRef.current[activeInstrument]
        if (!sampler) {
          return
        }

        if (activeInstrument === Instrument.Drums) {
          sampler.triggerAttackRelease(note.pitch + '3', durationSec, time)
          return
        }

        sampler.triggerAttackRelease(note.pitch + octaveRef.current.toString(), durationSec, time)
      }, startTimeSec)
    })
  }

  return { constructComposition }
}
