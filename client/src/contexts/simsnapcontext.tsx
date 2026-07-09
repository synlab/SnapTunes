import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'

/*
Included Contexts
- LastTimeSnapOrUnsnapContext: Tracks the last time a snap or unsnap event occurred, allowing components to respond to these events.

*/

interface LastTimeSnapOrUnsnapContextValue {
  lastTimeSnapOrUnsnapContext: number
}

interface UpdateLastTimeSnapOrUnsnapContextValue {
  setlastTimeSnapOrUnsnapContext: Dispatch<SetStateAction<number>>
}

interface ProviderProps {
  children: ReactNode
}

const LastTimeSnapOrUnsnapSnapContext = createContext<LastTimeSnapOrUnsnapContextValue | undefined>(undefined)
const LastTimeSnapOrUnsnapUpdateSnapContext = createContext<UpdateLastTimeSnapOrUnsnapContextValue | undefined>(undefined)

const useRequiredContext = <T,>(context: T | undefined, errorMessage: string): T => {
  if (context === undefined) {
    throw new Error(errorMessage)
  }

  return context
}

export const LastTimeSnapOrUnsnapContextProvider = ({ children }: ProviderProps) => {
  const [lastTimeSnapOrUnsnapContext, setlastTimeSnapOrUnsnapContext] = useState<number>(0)

  return (
    <LastTimeSnapOrUnsnapSnapContext.Provider value={{ lastTimeSnapOrUnsnapContext: lastTimeSnapOrUnsnapContext }}>
      <LastTimeSnapOrUnsnapUpdateSnapContext.Provider value={{ setlastTimeSnapOrUnsnapContext: setlastTimeSnapOrUnsnapContext }}>
        {children}
      </LastTimeSnapOrUnsnapUpdateSnapContext.Provider>
    </LastTimeSnapOrUnsnapSnapContext.Provider>
  )
}

export const useLastTimeSnapOrUnsnapContext = (): LastTimeSnapOrUnsnapContextValue =>
  useRequiredContext(useContext(LastTimeSnapOrUnsnapSnapContext), 'LastTimeSnapOrUnsnapContext Error')

export const useUpdateLastTimeSnapOrUnsnapContext = (): UpdateLastTimeSnapOrUnsnapContextValue =>
  useRequiredContext(useContext(LastTimeSnapOrUnsnapUpdateSnapContext), 'Update LastTimeSnapOrUnsnapContext Error')