// App entry page.
// Step 2-3: showed <CameraView /> (camera + hand tracking).
// Step 4: showed <Recorder />, which records sign examples.
// Step 8: two modes - "Recognize" (live top-3 signs, the default) and "Record".
import { useState } from 'react'
import Recognizer from './recognizer'
import Recorder from './recorder'

function App() {
  const [mode, setMode] = useState<'recognize' | 'record'>('recognize')

  return (
    <main>
      <h1>Conversation Bridge</h1>
      <nav className="mode-switch">
        <button aria-pressed={mode === 'recognize'} onClick={() => setMode('recognize')}>
          Recognize
        </button>
        <button aria-pressed={mode === 'record'} onClick={() => setMode('record')}>
          Record
        </button>
      </nav>
      {/* Only one camera at a time: switching modes restarts it */}
      {mode === 'recognize' ? <Recognizer /> : <Recorder />}
    </main>
  )
}

export default App
