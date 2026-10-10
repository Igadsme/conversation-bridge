// STEP 4 - Sign recorder.
// Pick a sign, press Space, sign it during the 2-second window, repeat.
// Each recording keeps only hand landmark points (no video), and the
// examples are downloaded as one JSON file to save in data/recordings/.
// The matcher in step 5 compares live signing against these examples.
//
// How it works:
// - framesRef, not state: frames arrive ~30 times a second. Storing them in
//   state would re-render the page 30 times a second, so they go in a ref and
//   only the finished example goes into state.
// - "Hands seen" check: if MediaPipe lost the hands for most of the clip (out
//   of frame, bad light), the example isn't saved - it would teach the matcher noise.
// - round(): 4 decimal places is plenty and keeps the JSON about half the size.
// - The dropdown counts show how many examples each sign has, e.g. COFFEE (3).
// STEP 6: CameraView now uses HolisticLandmarker, which reports the left and
// right hand separately, so the hands are read from those two lists.

import { useEffect, useRef, useState } from 'react'
import type { HolisticLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import CameraView from './cameraview'
import { VOCABULARY, type Frame, type Point, type SignExample } from './signs'
import './recorder.css'

const COUNTDOWN_SECONDS = 3
const RECORD_MS = 2000

type Phase = 'idle' | 'countdown' | 'recording'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (n: number) => Math.round(n * 10000) / 10000

export default function Recorder() {
  const [sign, setSign] = useState(VOCABULARY[0])
  const [phase, setPhase] = useState<Phase>('idle')
  const [countdown, setCountdown] = useState(0)
  const [message, setMessage] = useState('Pick a sign and press Space to record')
  const [examples, setExamples] = useState<SignExample[]>([])
  const framesRef = useRef<Frame[]>([])
  const startRef = useRef(0)

  // How many examples we have for each sign (shown in the dropdown)
  const counts = new Map<string, number>()
  for (const ex of examples) counts.set(ex.sign, (counts.get(ex.sign) ?? 0) + 1)

  // Called by CameraView for every video frame
  function handleFrame(result: HolisticLandmarkerResult) {
    if (phase !== 'recording') return
    const toPoints = (hand: NormalizedLandmark[]) =>
      hand.map((p): Point => [round(p.x), round(p.y), round(p.z)])
    framesRef.current.push({
      t: Math.round(performance.now() - startRef.current),
      hands: [
        ...result.leftHandLandmarks.map((hand) => ({ handedness: 'Left', points: toPoints(hand) })),
        ...result.rightHandLandmarks.map((hand) => ({ handedness: 'Right', points: toPoints(hand) })),
      ],
    })
  }

  async function startRecording() {
    if (phase !== 'idle') return

    setPhase('countdown')
    for (let n = COUNTDOWN_SECONDS; n > 0; n--) {
      setCountdown(n)
      await wait(1000)
    }

    framesRef.current = []
    startRef.current = performance.now()
    setPhase('recording')
    await wait(RECORD_MS)
    setPhase('idle')

    const frames = framesRef.current
    framesRef.current = []
    const seen = frames.filter((f) => f.hands.length > 0).length

    if (seen < frames.length / 2) {
      setMessage(`Hands seen in only ${seen}/${frames.length} frames. Not saved, try again.`)
      return
    }

    setExamples((prev) => [...prev, { sign, recordedAt: new Date().toISOString(), frames }])
    setMessage(`Saved ${sign} #${(counts.get(sign) ?? 0) + 1} (hands in ${seen}/${frames.length} frames)`)
  }

  // Save all examples as a JSON file (examples are lost on page refresh until downloaded)
  function download() {
    const blob = new Blob([JSON.stringify(examples)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `signs-${new Date().toISOString().slice(0, 19)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Space starts a recording, so you don't have to reach for the mouse
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      // Let Space work normally on a focused button or dropdown
      if (e.target instanceof HTMLElement && e.target.closest('button, select')) return
      e.preventDefault()
      startRecording()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const banner =
    phase === 'countdown' ? `Get ready… ${countdown}` :
    phase === 'recording' ? `● Recording ${sign}` :
    message

  return (
    <div>
      <CameraView onFrame={handleFrame} />

      <p className={`recorder-banner ${phase}`}>{banner}</p>

      <div className="recorder-controls">
        <label>
          Sign{' '}
          <select value={sign} onChange={(e) => setSign(e.target.value)} disabled={phase !== 'idle'}>
            {VOCABULARY.map((s) => (
              <option key={s} value={s}>
                {s} ({counts.get(s) ?? 0})
              </option>
            ))}
          </select>
        </label>
        <button onClick={startRecording} disabled={phase !== 'idle'}>
          Record (Space)
        </button>
        <button
          onClick={() => setExamples((prev) => prev.slice(0, -1))}
          disabled={phase !== 'idle' || examples.length === 0}
        >
          Undo last
        </button>
        <button onClick={download} disabled={examples.length === 0}>
          Download {examples.length} examples
        </button>
      </div>
    </div>
  )
}
