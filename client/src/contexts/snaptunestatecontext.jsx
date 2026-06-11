import {createContext, useContext, useState} from 'react';
/*
Included Contexts
- Play/Pause/Stop State
- Draw State (Draw/Erase)
- Current Octave
- Current Instrument
- Active SFX & Values
- Toggle Clear
- Toggle Undo

I prefer splitting up each variable into its own context, 
as not every component needs access to every state variable.
*/

//------Context Initialization-----//
//0, 1, 2: Stop, Play, Pause
const PlaybackContext = createContext(0);
const UpdatePlaybackContext = createContext(null);

//true, false: Draw, Erase
const DrawStateContext = createContext(true);
const UpdateDrawStateContext = createContext(null);

const BPMContext = createContext(120);
const UpdateBPMContext = createContext(null);

const UndoContext =  createContext(null);
const UpdateUndoContext =  createContext(null);

const OctaveContext = createContext(0);
const UpdateOctaveContext = createContext(null);

const InstrumentContext = createContext(null);
const UpdateInstrumentContext = createContext(null);

const SFXContext = createContext(null);
const UpdateSFXContext = createContext(null);

const ClearContext = createContext(false);
const UpdateClearContext = createContext(null);

//-----Provider Code-----//
export const PlaybackContextProvider = ({children}) => {
    const [playback, setPlayback] = useState(0);
    return(
        <PlaybackContext.Provider value={{playback}}>
            <UpdatePlaybackContext.Provider value={{setPlayback}}>
                {children}
            </UpdatePlaybackContext.Provider>
        </PlaybackContext.Provider>
    )
}

export const DrawStateContextProvider = ({children}) => {
    const [drawState, setDrawState] = useState(true);
    return(
        <DrawStateContext.Provider value={{drawState}}>
            <UpdateDrawStateContext.Provider value={{setDrawState}}>
                {children}
            </UpdateDrawStateContext.Provider>
        </DrawStateContext.Provider>
    )
}

export const BPMContextProvider = ({children}) => {
    const [bpm, setBPM] = useState(120);
    return(
        <BPMContext.Provider value={{bpm}}>
            <UpdateBPMContext.Provider value={{setBPM}}>
                {children}
            </UpdateBPMContext.Provider>
        </BPMContext.Provider>
    )
}

export const UndoContextProvider = ({children}) => {
    const [undo, setUndo] = useState(0);
    return(
        <UndoContext.Provider value={{undo}}>
            <UpdateUndoContext.Provider value={{setUndo}}>
                {children}
            </UpdateUndoContext.Provider>
        </UndoContext.Provider>
    )
}

export const OctaveContextProvider = ({children}) => {
    const [octave, setOctave] = useState(0);
    return(
        <OctaveContext.Provider value={{octave}}>
            <UpdateOctaveContext.Provider value={{setOctave}}>
                {children}
            </UpdateOctaveContext.Provider>
        </OctaveContext.Provider>
    )
}

export const InstrumentContextProvider = ({children}) => {
    const [instrument, setInstrument] = useState(null);
    return(
        <InstrumentContext.Provider value={{instrument}}>
            <UpdateInstrumentContext.Provider value={{setInstrument}}>
                {children}
            </UpdateInstrumentContext.Provider>
        </InstrumentContext.Provider>
    )
}

export const SFXContextProvider = ({children}) => {
    const [sfx, setSfx] = useState(null);
    return(
        <SFXContext.Provider value={{sfx}}>
            <UpdateSFXContext.Provider value={{setSfx}}>
                {children}
            </UpdateSFXContext.Provider>
        </SFXContext.Provider>
    )
}

export const ClearContextProvider = ({children}) => {
    const [clear, setClear] = useState(false);
    return(
        <ClearContext.Provider value={{clear}}>
            <UpdateClearContext.Provider value={{setClear}}>
                {children}
            </UpdateClearContext.Provider>
        </ClearContext.Provider>
    )
}


//-----useContext Exports-----//
export const usePlayback = () => {
    const context = useContext(PlaybackContext);
    if(!context){
        throw new Error("Playback Error");
    }
    return context
}

export const useUpdatePlayback = () => {
    const context = useContext(UpdatePlaybackContext);
    if(!context){
        throw new Error("Playback Update Error");
    }
    return context
}

export const useDrawState = () => {
    const context = useContext(DrawStateContext);
    if(!context){
        throw new Error("DrawState Error");
    }
    return context
}

export const useUpdateDrawState = () => {
    const context = useContext(UpdateDrawStateContext);
    if(!context){
        throw new Error("UpdateDrawState Error");
    }
    return context
}
export const useBPM = () => {
    const context = useContext(BPMContext);
    if(!context){
        throw new Error("BPM Error");
    }
    return context
}

export const useUpdateBPM = () => {
    const context = useContext(BPMContextProvider);
    if(!context){
        throw new Error("UpdateBPM Error");
    }
    return context
}

export const useUndo = () => {
    const context = useContext(UndoContext);
    if(!context){
        throw new Error("Undo Error");
    }
    return context
}

export const useUpdateUndo = () => {
    const context = useContext(UpdateUndoContext);
    if(!context){
        throw new Error("Undo Update Error");
    }
    return context
}

export const useOctave = () => {
    const context = useContext(OctaveContext);
    if(!context){
        throw new Error("Octave Error");
    }
    return context
}

export const useUpdateOctave = () => {
    const context = useContext(UpdateOctaveContext);
    if(!context){
        throw new Error("Octave Error");
    }
    return context
}

export const useInstrument = () => {
    const context = useContext(InstrumentContext);
    if(!context){
        throw new Error("Instrument Status Error");
    }
    return context
}

export const useUpdateInstrument = () => {
    const context = useContext(UpdateInstrumentContext);
    if(!context){
        throw new Error("Instrument Status Error");
    }
    return context
}

export const useSFX = () => {
    const context = useContext(SFXContext);
    if(!context){
        throw new Error("SFX Error");
    }
    return context
}

export const useUpdateSFX = () => {
    const context = useContext(UpdateSFXContext);
    if(!context){
        throw new Error("SFX Error");
    }
    return context
}

export const useClear = () => {
    const context = useContext(ClearContext);
    if(!context){
        throw new Error("NoteSpace Clear Error");
    }
    return context
}

export const useUpdateClear = () => {
    const context = useContext(UpdateClearContext);
    if(!context){
        throw new Error("NoteSpace Clear Error");
    }
    return context
}
