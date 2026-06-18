import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import * as ctx from './contexts/snaptunestatecontext'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

//Octave and Clear contexts provided to App for tangible interactions
//Shake to clear, and Tilt to change octave

createRoot(rootElement).render(
  <ctx.BPMContextProvider>
    <ctx.PlaybackContextProvider>
      <ctx.InstrumentContextProvider>
        <ctx.OctaveContextProvider>
          <ctx.ClearContextProvider>
            <App />
          </ctx.ClearContextProvider>
        </ctx.OctaveContextProvider>
      </ctx.InstrumentContextProvider>
    </ctx.PlaybackContextProvider>
  </ctx.BPMContextProvider>
)