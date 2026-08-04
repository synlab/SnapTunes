import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import * as ctx from './contexts/snaptunestatecontext'
import * as simsnapctx from './contexts/simsnapcontext'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

//Octave and Clear contexts provided to App for tangible interactions
//Shake to clear, and Tilt to change octave

createRoot(rootElement).render(
  <simsnapctx.LastTimeSnapOrUnsnapContextProvider>
    <ctx.BPMContextProvider>
      <ctx.PlaybackContextProvider>
        <ctx.CompositionContextProvider>
          <ctx.DrumsCompositionContextProvider>
            <ctx.InstrumentContextProvider>
              <ctx.OctaveContextProvider>
                <ctx.ClearContextProvider>
                  <ctx.UndoContextProvider>
                    <App />
                  </ctx.UndoContextProvider>
                </ctx.ClearContextProvider>
              </ctx.OctaveContextProvider>
            </ctx.InstrumentContextProvider>
          </ctx.DrumsCompositionContextProvider>
        </ctx.CompositionContextProvider>
      </ctx.PlaybackContextProvider>
    </ctx.BPMContextProvider>
  </simsnapctx.LastTimeSnapOrUnsnapContextProvider>
)