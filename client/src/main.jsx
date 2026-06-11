import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import * as ctx from './contexts/snaptunestatecontext.jsx'

//Octave and Clear contexts provided to App for tangible interactions
//Shake to clear, and Tilt to change octave

createRoot(document.getElementById('root')).render(
    <>  
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
    </>
)
