// PERSONAL CALIBRATION 1 - Record the signer's own examples for training.
// (Replaces the step 4 recorder, which saved hand points over a fixed 2 seconds.)
//
// Clips are cut by the same Segmenter as the Recognize page - hands up, sign,
// hands down - with the same resting frames before and after, so the training
// data looks exactly like what the app sees live.
//
// How to use: pick a sign, press Space (or Start), then sign it again and again,
// lowering your hands out of view after each one. Every sign is saved
// automatically; recording stops at TARGET examples. Download often - examples
// only live in this page until downloaded.
//
// Only body and hand points are saved (x/y, see PersonalClip in signs.ts), never video.
//
// CUSTOM SIGNS: "Add your own word or phrase" adds a label of your own, e.g.
// "hello how are you" -> HELLO-HOW-ARE-YOU. Sign a phrase in one go, without
// lowering your hands in the middle, so it's saved as one clip. Your own labels
// are remembered in this browser.

import { useEffect, useRef, useState } from 'react'
import type { HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import CameraView from './cameraview'
import { Segmenter, type SignClip } from './segmenter'
import { NOT_A_SIGN, VOCABULARY, toSignName, type PersonalClip } from './signs'
import './recorder.css'

const TARGET = 15 // examples per sign
const MIN_SIGN_FRAMES = 8 // shorter signs are probably a twitch, not a sign
const CUSTOM_KEY = 'customSigns' // browser storage key for your own labels

// Your own labels from earlier visits (browser storage can be unavailable, e.g. private mode)
function loadCustomSigns(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((s) => typeof s === 'string' && toSignName(s) === s) : []
  } catch {
    return []
  }
}

function saveCustomSigns(signs: string[]) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(signs))
  } catch {
    // not saved for next time - still works for this visit
  }
}

// Where each part sits in the app's 543-point frame (see landmarks.ts)
const PARTS = [
  { start: 489, count: 33 }, // pose
  { start: 468, count: 21 }, // left hand
  { start: 522, count: 21 }, // right hand
]

// 4 decimal places is plenty and keeps the files about half the size
const round = (n: number) => (Number.isNaN(n) ? null : Math.round(n * 10000) / 10000)

// One 543-point frame -> 150 numbers: x/y of pose, left hand, right hand
function compactFrame(frame: Float32Array): (number | null)[] {
  const out: (number | null)[] = []
  for (const part of PARTS) {
    for (let i = 0; i < part.count; i++) {
      out.push(round(frame[(part.start + i) * 3]), round(frame[(part.start + i) * 3 + 1]))
    }
  }
  return out
}

export default function Recorder() {
  const [customSigns, setCustomSigns] = useState(loadCustomSigns)
  const [newSign, setNewSign] = useState('')
  const LABELS = [...VOCABULARY, ...customSigns, NOT_A_SIGN]
  const [sign, setSign] = useState(VOCABULARY[0])
  const [armed, setArmed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [clips, setClips] = useState<PersonalClip[]>([])
  const [message, setMessage] = useState('Pick a sign, press Space, then sign it again and again')
  const [unsaved, setUnsaved] = useState(0)
  const segmenterRef = useRef(new Segmenter())

  // How many examples we have for each sign (shown in the dropdown)
  const counts = new Map<string, number>()
  for (const c of clips) counts.set(c.sign, (counts.get(c.sign) ?? 0) + 1)
  const count = counts.get(sign) ?? 0

  function toggle() {
    segmenterRef.current.reset() // don't keep half a sign from before
    setSigning(false)
    setArmed((a) => !a)
    setMessage(armed ? 'Paused' : `Recording ${sign}: raise your hands, sign, lower them`)
  }

  // Called by CameraView for every video frame
  function handleFrame(result: HolisticLandmarkerResult, modelFrame: Float32Array) {
    if (!armed) return
    const segmenter = segmenterRef.current
    const handsVisible = result.leftHandLandmarks.length > 0 || result.rightHandLandmarks.length > 0
    const finished = segmenter.push(modelFrame, handsVisible)
    if (segmenter.isSigning !== signing) setSigning(segmenter.isSigning)
    if (finished) save(finished)
  }

  function save(finished: SignClip) {
    const length = finished.end - finished.start
    if (length < MIN_SIGN_FRAMES) {
      setMessage(`Too short (${length} frames) - not saved. Sign it again.`)
      return
    }
    const clip: PersonalClip = {
      sign,
      recordedAt: new Date().toISOString(),
      start: finished.start,
      end: finished.end,
      frames: finished.padded.map(compactFrame),
    }
    setClips((prev) => [...prev, clip])
    setUnsaved((n) => n + 1)
    const done = count + 1
    if (done >= TARGET) {
      setArmed(false)
      setMessage(`${sign}: ${done}/${TARGET} done. Download, then pick the next sign.`)
    } else {
      setMessage(`Saved ${sign} #${done} (${length} frames). Again!`)
    }
  }

  // CUSTOM SIGNS: add a word or phrase of your own and select it
  function addCustomSign() {
    const name = toSignName(newSign)
    if (!name) {
      setMessage('Use letters and numbers, starting with a letter, up to 30 characters')
      return
    }
    if (!VOCABULARY.includes(name) && name !== NOT_A_SIGN && !customSigns.includes(name)) {
      const next = [...customSigns, name]
      setCustomSigns(next)
      saveCustomSigns(next)
    }
    setSign(name)
    setNewSign('')
    setMessage(`Selected ${name}. Press Space and sign it - a phrase in one go, then lower your hands.`)
  }

  // Remove the last example of the current sign (e.g. you signed it wrong)
  function undo() {
    const i = clips.map((c) => c.sign).lastIndexOf(sign)
    if (i < 0) return
    setClips((prev) => prev.filter((_, k) => k !== i))
    setUnsaved((n) => Math.max(0, n - 1))
    setMessage(`Removed the last ${sign} example`)
  }

  function download() {
    const blob = new Blob([JSON.stringify(clips)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personal-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
    setUnsaved(0)
  }

  // Space starts/pauses recording, so you don't have to reach for the mouse
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      // Let Space work normally on a focused button, dropdown or text box
      if (e.target instanceof HTMLElement && e.target.closest('button, select, input')) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Warn before closing or refreshing with examples that aren't downloaded yet
  useEffect(() => {
    if (unsaved === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const banner = !armed ? message : signing ? `● Signing ${sign}…` : message

  return (
    <div>
      <CameraView onFrame={handleFrame} />

      <p className={`recorder-banner ${armed ? (signing ? 'recording' : 'countdown') : 'idle'}`}>{banner}</p>

      <div className="recorder-controls">
        <label>
          Sign{' '}
          <select value={sign} onChange={(e) => setSign(e.target.value)} disabled={armed}>
            {LABELS.map((s) => (
              <option key={s} value={s}>
                {s} ({counts.get(s) ?? 0}/{TARGET})
              </option>
            ))}
          </select>
        </label>
        <button onClick={toggle}>{armed ? 'Pause (Space)' : 'Start (Space)'}</button>
        <button onClick={undo} disabled={armed || count === 0}>
          Undo last {sign}
        </button>
        <button onClick={download} disabled={clips.length === 0}>
          Download {clips.length} examples{unsaved > 0 ? ` (${unsaved} new)` : ''}
        </button>
      </div>

      {/* CUSTOM SIGNS */}
      <form
        className="recorder-controls recorder-custom"
        onSubmit={(e) => {
          e.preventDefault()
          addCustomSign()
        }}
      >
        <label>
          Add your own word or phrase{' '}
          <input
            value={newSign}
            onChange={(e) => setNewSign(e.target.value)}
            placeholder="e.g. hello how are you"
            maxLength={40}
            disabled={armed}
          />
        </label>
        <button type="submit" disabled={armed || !newSign.trim()}>
          Add
        </button>
        {newSign.trim() && <span className="recorder-preview">{toSignName(newSign) ?? 'not valid'}</span>}
      </form>

      <p className="recorder-progress">
        {LABELS.filter((s) => (counts.get(s) ?? 0) >= TARGET).length} of {LABELS.length} signs done
      </p>
    </div>
  )
}
