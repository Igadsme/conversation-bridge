// PERSONAL CALIBRATION 1 - Record the signer's own examples for training.
// (Replaces the step 4 recorder, which saved hand points over a fixed 2 seconds.)
//
// Clips are cut by the same Segmenter as the Recognize page - hands up, sign,
// hands down - with the same resting frames before and after, so the training
// data looks exactly like what the app sees live.
//
// How to use: pick a sign, press Space (or Start), then sign it again and again,
// lowering your hands out of view after each one. Every sign is saved
// automatically; recording stops at TARGET examples. Examples are kept in this
// browser (clipstore.ts) - "Download backup" saves a copy, "Import files" loads
// downloaded files back (e.g. data/personal/*.json). Then "Train my model"
// (trainingpanel.tsx) trains the personal model right here.
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
import { deleteClip, deleteEverything, loadClips, saveClips } from './clipstore'
import { PersonalModel } from './personalmodel'
import { Segmenter, type SignClip } from './segmenter'
import { COMPACT_PARTS, NOT_A_SIGN, VOCABULARY, clipKey, isPersonalClip, toSignName, type PersonalClip } from './signs'
import { MIN_EXAMPLES, dedupe } from './trainer'
import TrainingPanel from './trainingpanel'
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

// 4 decimal places is plenty and keeps the files about half the size
const round = (n: number) => (Number.isNaN(n) ? null : Math.round(n * 10000) / 10000)

// One 543-point frame -> 150 numbers: x/y of pose, left hand, right hand
function compactFrame(frame: Float32Array): (number | null)[] {
  const out: (number | null)[] = []
  for (const part of COMPACT_PARTS) {
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
  const segmenterRef = useRef(new Segmenter())
  const importRef = useRef<HTMLInputElement>(null)

  // Examples kept in this browser from earlier visits
  useEffect(() => {
    loadClips()
      .then((stored) => setClips((prev) => dedupe([...stored, ...prev])))
      .catch(() => setMessage('This browser cannot keep recordings - use Download backup before leaving'))
  }, [])

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
    saveClips([clip]).catch(() => setMessage('Could not keep that example in this browser - use Download backup'))
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
    deleteClip(clips[i]).catch(() => {})
    setClips((prev) => prev.filter((_, k) => k !== i))
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
  }

  // Load downloaded files (e.g. data/personal/*.json) back into this browser
  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    const imported: PersonalClip[] = []
    let rejected = 0
    for (const file of files) {
      try {
        const data: unknown = JSON.parse(await file.text())
        if (!Array.isArray(data)) {
          rejected++ // e.g. personal_model.json
          continue
        }
        for (const c of data) if (isPersonalClip(c)) imported.push(c)
      } catch {
        rejected++
      }
    }
    const known = new Set(clips.map(clipKey))
    const added = dedupe(imported).filter((c) => !known.has(clipKey(c)))
    try {
      await saveClips(added)
    } catch {
      setMessage('Could not keep the imported examples in this browser')
      return
    }
    setClips((prev) => [...prev, ...added])
    setMessage(`Imported ${added.length} new examples${rejected ? ` (${rejected} files skipped)` : ''}`)
  }

  // Delete every recording and the model trained on them from this browser
  async function deleteAll() {
    if (!window.confirm('Delete all your recordings and your trained model from this browser?')) return
    try {
      await deleteEverything()
    } catch {
      setMessage('Could not delete - try clearing this site\'s data in the browser settings')
      return
    }
    PersonalModel.replace(null)
    setClips([])
    setMessage('Deleted your recordings and your model from this browser')
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
        <button className="recorder-start" aria-pressed={armed} onClick={toggle}>
          {armed ? 'Pause (Space)' : 'Start (Space)'}
        </button>
        <button onClick={undo} disabled={armed || count === 0}>
          Undo last {sign}
        </button>
      </div>

      <div className="recorder-controls recorder-files">
        <button onClick={download} disabled={clips.length === 0}>
          Download backup ({clips.length})
        </button>
        <button onClick={() => importRef.current?.click()} disabled={armed}>
          Import files
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => {
            importFiles(e.target.files)
            e.target.value = '' // the same file can be picked again
          }}
        />
        <button onClick={deleteAll} disabled={armed || clips.length === 0}>
          Delete all
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

      <TrainingPanel ready={[...counts.values()].filter((n) => n >= MIN_EXAMPLES).length} disabled={armed} />
    </div>
  )
}
