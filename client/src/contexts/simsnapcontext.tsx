import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'

/*
Included Contexts
- Play/Pause/Stop State
- Draw State (Draw/Erase)
- Current Octave
- Current Instrument
- Active SFX & Values
- Toggle Clear
- Toggle Undo

I(snowie) prefer splitting up each variable into its own context, 
as not every component needs access to every state variable.
*/

interface SnapContextValue {
  snapContext: number
}

interface UpdateSnapContextValue {
  setSnapContext: Dispatch<SetStateAction<number>>
}

interface ProviderProps {
  children: ReactNode
}

const SnapContext = createContext<SnapContextValue | undefined>(undefined)
const UpdateSnapContext = createContext<UpdateSnapContextValue | undefined>(undefined)

const useRequiredContext = <T,>(context: T | undefined, errorMessage: string): T => {
  if (context === undefined) {
    throw new Error(errorMessage)
  }

  return context
}

export const SnapContextProvider = ({ children }: ProviderProps) => {
  const [snapContext, setSnapContext] = useState<number>(0)

  return (
    <SnapContext.Provider value={{ snapContext }}>
      <UpdateSnapContext.Provider value={{ setSnapContext }}>
        {children}
      </UpdateSnapContext.Provider>
    </SnapContext.Provider>
  )
}

export const useSnapContext = (): SnapContextValue =>
  useRequiredContext(useContext(SnapContext), 'SnapContext Error')

export const useUpdateSnapContext = (): UpdateSnapContextValue =>
  useRequiredContext(useContext(UpdateSnapContext), 'Update SnapContext Error')