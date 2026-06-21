import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { Instrument, Note } from '../types'

interface PlaybackContextValue {
  playback: 0 | 1 | 2 | 'stop'
}

interface PlaybackUpdateContextValue {
  setPlayback: Dispatch<SetStateAction<0 | 1 | 2 | 'stop'>>
}

//Composition of the instruments without percussion
interface CompostionContextValue {
  composition: Note[]
}

interface CompositionUpdateContextValue {
  setComposition: Dispatch<SetStateAction<Note[]>>
}

//Composition of the percussion instruments (drums)
interface DrumsCompostionContextValue {
  drumsComposition: Note[] //Maybe not the same kind of note ? 
  // There is no pitch on a percussion ?
}


interface DrumsCompositionUpdateContextValue {
  setDrumsComposition: Dispatch<SetStateAction<Note[]>>
}

interface DrawStateContextValue {
  drawState: boolean
}

interface DrawStateUpdateContextValue {
  setDrawState: Dispatch<SetStateAction<boolean>>
}

interface BPMContextValue {
  bpm: number
}

interface BPMUpdateContextValue {
  setBPM: Dispatch<SetStateAction<number>>
}

interface UndoContextValue {
  undo: boolean
}

interface UndoUpdateContextValue {
  setUndo: Dispatch<SetStateAction<boolean>>
}

interface OctaveContextValue {
  octave: number
}

interface OctaveUpdateContextValue {
  setOctave: Dispatch<SetStateAction<number>>
}

interface InstrumentContextValue {
  instrument: Instrument | null
}

interface InstrumentUpdateContextValue {
  setInstrument: Dispatch<SetStateAction<Instrument | null>>
}

interface SFXContextValue {
  sfx: unknown
}

interface SFXUpdateContextValue {
  setSfx: Dispatch<SetStateAction<unknown>>
}

interface ClearContextValue {
  clear: boolean
}

interface ClearUpdateContextValue {
  setClear: Dispatch<SetStateAction<boolean>>
}

interface ProviderProps {
  children: ReactNode
}

const PlaybackContext = createContext<PlaybackContextValue | undefined>(undefined)
const UpdatePlaybackContext = createContext<PlaybackUpdateContextValue | undefined>(undefined)

const CompositionContext = createContext<CompostionContextValue | undefined>(undefined)
const UpdateCompositionContext = createContext<CompositionUpdateContextValue | undefined>(undefined)

const DrumsCompositionContext = createContext<DrumsCompostionContextValue | undefined>(undefined)
const UpdateDrumsCompositionContext = createContext<DrumsCompositionUpdateContextValue | undefined>(undefined)

const DrawStateContext = createContext<DrawStateContextValue | undefined>(undefined)
const UpdateDrawStateContext = createContext<DrawStateUpdateContextValue | undefined>(undefined)

const BPMContext = createContext<BPMContextValue | undefined>(undefined)
const UpdateBPMContext = createContext<BPMUpdateContextValue | undefined>(undefined)

const UndoContext = createContext<UndoContextValue | undefined>(undefined)
const UpdateUndoContext = createContext<UndoUpdateContextValue | undefined>(undefined)

const OctaveContext = createContext<OctaveContextValue | undefined>(undefined)
const UpdateOctaveContext = createContext<OctaveUpdateContextValue | undefined>(undefined)

const InstrumentContext = createContext<InstrumentContextValue | undefined>(undefined)
const UpdateInstrumentContext = createContext<InstrumentUpdateContextValue | undefined>(undefined)

const SFXContext = createContext<SFXContextValue | undefined>(undefined)
const UpdateSFXContext = createContext<SFXUpdateContextValue | undefined>(undefined)

const ClearContext = createContext<ClearContextValue | undefined>(undefined)
const UpdateClearContext = createContext<ClearUpdateContextValue | undefined>(undefined)

const useRequiredContext = <T,>(context: T | undefined, errorMessage: string): T => {
  if (context === undefined) {
    throw new Error(errorMessage)
  }

  return context
}

export const PlaybackContextProvider = ({ children }: ProviderProps) => {
  const [playback, setPlayback] = useState<0 | 1 | 2 | 'stop'>(0)

  return (
    <PlaybackContext.Provider value={{ playback }}>
      <UpdatePlaybackContext.Provider value={{ setPlayback }}>
        {children}
      </UpdatePlaybackContext.Provider>
    </PlaybackContext.Provider>
  )
}

export const CompositionContextProvider = ({ children }: ProviderProps) => {
  const [composition, setComposition] = useState<Note[]>([])

  return (
    <CompositionContext.Provider value={{ composition }}>
      <UpdateCompositionContext.Provider value={{ setComposition }}>
        {children}
      </UpdateCompositionContext.Provider>
    </CompositionContext.Provider>
  )
}

export const DrumsCompositionContextProvider = ({ children }: ProviderProps) => {
  const [drumsComposition, setDrumsComposition] = useState<Note[]>([])

  return (
    <DrumsCompositionContext.Provider value={{ drumsComposition }}>
      <UpdateDrumsCompositionContext.Provider value={{ setDrumsComposition }}>
        {children}
      </UpdateDrumsCompositionContext.Provider>
    </DrumsCompositionContext.Provider>
  )
}

export const DrawStateContextProvider = ({ children }: ProviderProps) => {
  const [drawState, setDrawState] = useState<boolean>(true)

  return (
    <DrawStateContext.Provider value={{ drawState }}>
      <UpdateDrawStateContext.Provider value={{ setDrawState }}>
        {children}
      </UpdateDrawStateContext.Provider>
    </DrawStateContext.Provider>
  )
}

export const BPMContextProvider = ({ children }: ProviderProps) => {
  const [bpm, setBPM] = useState<number>(120)

  return (
    <BPMContext.Provider value={{ bpm }}>
      <UpdateBPMContext.Provider value={{ setBPM }}>
        {children}
      </UpdateBPMContext.Provider>
    </BPMContext.Provider>
  )
}

export const UndoContextProvider = ({ children }: ProviderProps) => {
  const [undo, setUndo] = useState<boolean>(false)

  return (
    <UndoContext.Provider value={{ undo }}>
      <UpdateUndoContext.Provider value={{ setUndo }}>
        {children}
      </UpdateUndoContext.Provider>
    </UndoContext.Provider>
  )
}

export const OctaveContextProvider = ({ children }: ProviderProps) => {
  const [octave, setOctave] = useState<number>(5)

  return (
    <OctaveContext.Provider value={{ octave }}>
      <UpdateOctaveContext.Provider value={{ setOctave }}>
        {children}
      </UpdateOctaveContext.Provider>
    </OctaveContext.Provider>
  )
}

export const InstrumentContextProvider = ({ children }: ProviderProps) => {
  const [instrument, setInstrument] = useState<Instrument | null>(Instrument.Piano)

  return (
    <InstrumentContext.Provider value={{ instrument }}>
      <UpdateInstrumentContext.Provider value={{ setInstrument }}>
        {children}
      </UpdateInstrumentContext.Provider>
    </InstrumentContext.Provider>
  )
}

export const SFXContextProvider = ({ children }: ProviderProps) => {
  const [sfx, setSfx] = useState<unknown>(null)

  return (
    <SFXContext.Provider value={{ sfx }}>
      <UpdateSFXContext.Provider value={{ setSfx }}>
        {children}
      </UpdateSFXContext.Provider>
    </SFXContext.Provider>
  )
}

export const ClearContextProvider = ({ children }: ProviderProps) => {
  const [clear, setClear] = useState<boolean>(false)

  return (
    <ClearContext.Provider value={{ clear }}>
      <UpdateClearContext.Provider value={{ setClear }}>
        {children}
      </UpdateClearContext.Provider>
    </ClearContext.Provider>
  )
}

export const usePlayback = (): PlaybackContextValue =>
  useRequiredContext(useContext(PlaybackContext), 'Playback Error')

export const useUpdatePlayback = (): PlaybackUpdateContextValue =>
  useRequiredContext(useContext(UpdatePlaybackContext), 'Playback Update Error')

//Composition
export const useComposition = (): CompostionContextValue =>
  useRequiredContext(useContext(CompositionContext), 'Composition Error')

export const useUpdateComposition = (): CompositionUpdateContextValue =>
  useRequiredContext(useContext(UpdateCompositionContext), 'Composition Update Error')

//Drums composition
export const useDrumsComposition = (): DrumsCompostionContextValue =>
  useRequiredContext(useContext(DrumsCompositionContext), 'Drums composition Error')

export const useUpdateDrumsComposition = (): DrumsCompositionUpdateContextValue =>
  useRequiredContext(useContext(UpdateDrumsCompositionContext), 'Drums composition Update Error')

export const useDrawState = (): DrawStateContextValue =>
  useRequiredContext(useContext(DrawStateContext), 'DrawState Error')

export const useUpdateDrawState = (): DrawStateUpdateContextValue =>
  useRequiredContext(useContext(UpdateDrawStateContext), 'UpdateDrawState Error')

export const useBPM = (): BPMContextValue => useRequiredContext(useContext(BPMContext), 'BPM Error')

export const useUpdateBPM = (): BPMUpdateContextValue =>
  useRequiredContext(useContext(UpdateBPMContext), 'UpdateBPM Error')

export const useUndo = (): UndoContextValue => useRequiredContext(useContext(UndoContext), 'Undo Error')

export const useUpdateUndo = (): UndoUpdateContextValue =>
  useRequiredContext(useContext(UpdateUndoContext), 'Undo Update Error')

export const useOctave = (): OctaveContextValue =>
  useRequiredContext(useContext(OctaveContext), 'Octave Error')

export const useUpdateOctave = (): OctaveUpdateContextValue =>
  useRequiredContext(useContext(UpdateOctaveContext), 'Octave Error')

export const useInstrument = (): InstrumentContextValue =>
  useRequiredContext(useContext(InstrumentContext), 'Instrument Status Error')

export const useUpdateInstrument = (): InstrumentUpdateContextValue =>
  useRequiredContext(useContext(UpdateInstrumentContext), 'Instrument Status Error')

export const useSFX = (): SFXContextValue => useRequiredContext(useContext(SFXContext), 'SFX Error')

export const useUpdateSFX = (): SFXUpdateContextValue =>
  useRequiredContext(useContext(UpdateSFXContext), 'SFX Error')

export const useClear = (): ClearContextValue =>
  useRequiredContext(useContext(ClearContext), 'NoteSpace Clear Error')

export const useUpdateClear = (): ClearUpdateContextValue =>
  useRequiredContext(useContext(UpdateClearContext), 'NoteSpace Clear Error')