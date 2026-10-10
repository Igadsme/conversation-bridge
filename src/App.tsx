// App entry page.
// Step 2-3: showed <CameraView /> (camera + hand tracking).
// Step 4: now shows <Recorder />, which wraps CameraView and records sign examples.
import Recorder from './recorder'

function App() {
  return (
    <main>
      <h1>Conversation Bridge</h1>
      <Recorder />
    </main>
  )
}

export default App
