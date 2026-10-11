// PERSONAL CALIBRATION 6 - "Train my model" on the Record page.
//
// Reads every recording kept in this browser (clipstore.ts), describes each one
// with ASL Citizen (once - the features are stored with the clip), trains the
// personal model (trainer.ts) and saves it in this browser. The Recognize page
// then uses it for Personal and Combined. Nothing leaves the device.

import { useEffect, useState } from 'react'
import { AslCitizenModel } from './aslcitizenmodel'
import { loadClips, loadModel, saveClips, saveModel } from './clipstore'
import { PersonalModel, type SavedModel } from './personalmodel'
import { NOT_A_SIGN } from './signs'
import { MIN_EXAMPLES, dedupe, expandFrame, trainPersonalModel, type Sample, type TrainingReport } from './trainer'

type Props = {
  ready: number // signs with at least MIN_EXAMPLES clips
  disabled: boolean // e.g. while recording
}

export default function TrainingPanel({ ready, disabled }: Props) {
  const [saved, setSaved] = useState<SavedModel | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [report, setReport] = useState<TrainingReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A model trained here on an earlier visit
  useEffect(() => {
    loadModel().then((m) => setSaved(m ?? null)).catch(() => {})
  }, [])

  async function train() {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      setStatus('Loading ASL Citizen…')
      setProgress(0)
      const citizen = await AslCitizenModel.load()

      // 1. ASL Citizen's description of every clip (only the new ones take time)
      const clips = dedupe(await loadClips())
      const samples: Sample[] = []
      for (const [i, clip] of clips.entries()) {
        let features = clip.features
        if (!features) {
          setStatus(`Reading your clips: ${i + 1} of ${clips.length}`)
          setProgress(((i + 1) / clips.length) * 0.5)
          const prediction = await citizen.predict(clip.frames.map(expandFrame))
          features = Array.from(prediction.features!)
          await saveClips([{ ...clip, features }])
        }
        samples.push({ sign: clip.sign, features })
      }

      // 2. Train, checking on held-back clips first
      setStatus('Training your model…')
      const result = await trainPersonalModel(samples, (f) => setProgress(0.5 + f / 2))

      // 3. Keep it, and use it from now on
      await saveModel(result.model)
      PersonalModel.replace(result.model)
      setSaved(result.model)
      setReport(result)
      setStatus('')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  function download() {
    if (!saved) return
    const blob = new Blob([JSON.stringify(saved)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'personal_model.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const savedClips = saved ? Object.values(saved.trainedOn).reduce((a, b) => a + b, 0) : 0

  return (
    <section className="trainer" aria-labelledby="trainer-title">
      <h2 id="trainer-title">Train my model</h2>
      <p className="trainer-note">
        Uses every recording in this browser. Signs need at least {MIN_EXAMPLES} examples; {ready} ready.
        Training runs on this device.
      </p>

      <div className="recorder-controls">
        <button className="recorder-start" onClick={train} disabled={disabled || busy || ready < 2}>
          {busy ? 'Training…' : saved ? 'Train again' : 'Train my model'}
        </button>
        <button onClick={download} disabled={!saved || busy}>
          Download model
        </button>
      </div>

      {!busy && (disabled || ready < 2) && (
        <p className="trainer-note">
          {disabled
            ? 'Pause recording (Space) to train.'
            : `To train, record at least ${MIN_EXAMPLES} examples of ${ready === 0 ? '2 signs' : 'one more sign'} - the model learns to tell your signs apart. Or use Import files to load earlier recordings.`}
        </p>
      )}

      {busy && (
        <div className="trainer-progress" role="status">
          <progress value={progress} max={1} />
          <span>{status}</span>
        </div>
      )}

      {error && (
        <p className="trainer-error" role="alert">
          {error}
        </p>
      )}

      {report && (
        <div className="trainer-report" role="status">
          <p className="trainer-score">
            {Math.round(report.accuracy * 100)}% <span>of clips it hadn't seen were recognized correctly</span>
          </p>
          <p>
            {report.signs} signs, {report.clips} clips ({report.tested} test tries). These test clips come from your
            own recording sessions, so check it live on the Recognize page too.
          </p>
          {report.mixups.length > 0 && (
            <>
              <p>Most often mixed up (record more of these):</p>
              <ul>
                {report.mixups.map((m) => (
                  <li key={`${m.sign}-${m.guess}`}>
                    {m.sign} → {m.guess}: {m.count}×
                  </li>
                ))}
              </ul>
            </>
          )}
          {Object.keys(report.skipped).length > 0 && (
            <p>
              Not included yet (fewer than {MIN_EXAMPLES} examples):{' '}
              {Object.entries(report.skipped)
                .map(([s, n]) => `${s} (${n})`)
                .join(', ')}
            </p>
          )}
          {!report.model.signs.includes(NOT_A_SIGN) && (
            <p>Tip: record {NOT_A_SIGN} too, so the model can say "not sure" instead of always picking a sign.</p>
          )}
        </div>
      )}

      {saved && !report && !busy && (
        <p className="trainer-note">
          Your model is saved in this browser: {saved.signs.length} signs, {savedClips} clips
          {saved.trainedAt ? `, trained ${new Date(saved.trainedAt).toLocaleString()}` : ''}.
        </p>
      )}
      {saved && !busy && (
        <p className="trainer-note">On the Sign to Speech page, choose Personal or Combined to use it.</p>
      )}
    </section>
  )
}
