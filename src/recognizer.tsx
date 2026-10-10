// STEP 8 - Live sign recognition, now with two models (ASL CITIZEN B5).
// CameraView gives us each frame in the 543-point format; the Segmenter cuts the
// stream into one clip per sign (hands up -> sign -> hands down); the chosen
// model(s) rank the signs for that clip and we show the top 3 from each.
//
// Switches:
// - Model: Kaggle (250 signs), ASL Citizen (2,731 signs), or Both side by side.
//   In Both, the main answer is whichever model is more confident.
// - Compare with: all the signs a model knows, or only our vocabulary.
//
// Confidence is the model's probability over all its signs. Below UNSURE_BELOW
// we say "not sure" instead of guessing (fingerspelling comes later).
// Tested with ASL Citizen test videos as a fake webcam: HELLO (Kaggle) and
// COFFEE (ASL Citizen) recognized; LARGE came out "not sure" (7-10%).

import { useEffect, useRef, useState } from 'react'
import type { HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import CameraView from './cameraview'
import { Segmenter } from './segmenter'
import { SignModel, toKaggleName, type Prediction } from './signmodel'
import { AslCitizenModel, aslCitizenToOurs } from './aslcitizenmodel'
import { ASL_CITIZEN_NAMES, VOCABULARY } from './signs'
import './recognizer.css'

const UNSURE_BELOW = 0.3

type Scope = 'all' | 'vocab'
type ModelId = 'kaggle' | 'citizen'
type Choice = ModelId | 'both'

// What the page needs from either model (SignModel and AslCitizenModel both fit)
type Recognizer = {
  knownSigns: string[]
  predict(clip: Float32Array[], vocabulary?: string[]): Promise<Prediction>
}

// Each model spells signs its own way; turn them into our names for display
const kaggleToOurs = new Map(VOCABULARY.map((s) => [toKaggleName(s), s]))
const MODEL_INFO: Record<ModelId, { label: string; toOurs: (sign: string) => string | undefined }> = {
  kaggle: { label: 'Kaggle', toOurs: (s) => kaggleToOurs.get(s) },
  citizen: { label: 'ASL Citizen', toOurs: aslCitizenToOurs },
}
const displayName = (id: ModelId, sign: string) => MODEL_INFO[id].toOurs(sign) ?? sign.toUpperCase()

// Which of our signs each model knows
function coverage(id: ModelId, model: Recognizer): string[] {
  const known = new Set(model.knownSigns)
  return VOCABULARY.filter((s) =>
    id === 'kaggle' ? known.has(toKaggleName(s)) : (ASL_CITIZEN_NAMES[s] ?? []).some((n) => known.has(n)),
  )
}

type Results = Partial<Record<ModelId, Prediction>>

export default function RecognizerPage() {
  const [models, setModels] = useState<Partial<Record<ModelId, Recognizer>>>({})
  const [errors, setErrors] = useState<Partial<Record<ModelId, string>>>({})
  const [choice, setChoice] = useState<Choice>('both')
  const [scope, setScope] = useState<Scope>('all')
  const [signing, setSigning] = useState(false)
  const [results, setResults] = useState<Results>({})
  const [history, setHistory] = useState<string[]>([])
  const segmenterRef = useRef(new Segmenter())
  // The last clip, so changing a switch can re-rank it straight away
  const lastClipRef = useRef<Float32Array[] | null>(null)
  // Clips are predicted one at a time, in order
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  // Load both models; each one works on its own if the other fails
  useEffect(() => {
    const loaders: Record<ModelId, () => Promise<Recognizer>> = {
      kaggle: () => SignModel.load(),
      citizen: () => AslCitizenModel.load(),
    }
    for (const id of Object.keys(loaders) as ModelId[]) {
      loaders[id]()
        .then((m) => setModels((prev) => ({ ...prev, [id]: m })))
        .catch((err) => {
          console.error(err)
          setErrors((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : String(err) }))
        })
    }
  }, [])

  const activeIds: ModelId[] = choice === 'both' ? ['kaggle', 'citizen'] : [choice]
  const ready = activeIds.some((id) => models[id])

  // Called by CameraView for every video frame
  function handleFrame(result: HolisticLandmarkerResult, modelFrame: Float32Array) {
    if (!ready) return
    const segmenter = segmenterRef.current
    const handsVisible = result.leftHandLandmarks.length > 0 || result.rightHandLandmarks.length > 0
    const clip = segmenter.push(modelFrame, handsVisible)

    // Only re-render when the signing state flips, not on every frame
    if (segmenter.isSigning !== signing) setSigning(segmenter.isSigning)

    if (clip) {
      lastClipRef.current = clip
      runPrediction(clip, activeIds, scope, true)
    }
  }

  // Rank a clip with each chosen model; `addToHistory` is false when re-ranking
  function runPrediction(clip: Float32Array[], ids: ModelId[], scope: Scope, addToHistory: boolean) {
    queueRef.current = queueRef.current.then(async () => {
      const next: Results = {}
      for (const id of ids) {
        const model = models[id]
        if (!model) continue
        try {
          next[id] = await model.predict(clip, scope === 'vocab' ? VOCABULARY : undefined)
        } catch (err) {
          console.error(`${MODEL_INFO[id].label} prediction failed`, err)
        }
      }
      setResults(next)
      const main = mainAnswer(next)
      if (addToHistory && main && main.probability >= UNSURE_BELOW) {
        setHistory((h) => [...h.slice(-9), main.name])
      }
    })
  }

  function change(nextChoice: Choice, nextScope: Scope) {
    setChoice(nextChoice)
    setScope(nextScope)
    const ids: ModelId[] = nextChoice === 'both' ? ['kaggle', 'citizen'] : [nextChoice]
    if (lastClipRef.current) runPrediction(lastClipRef.current, ids, nextScope, false)
  }

  const main = mainAnswer(results)
  const unsure = !main || main.probability < UNSURE_BELOW
  const loadingIds = activeIds.filter((id) => !models[id] && !errors[id])

  return (
    <div>
      <CameraView onFrame={handleFrame} />

      <p className={`recognizer-state ${signing ? 'signing' : ''}`}>
        {loadingIds.length > 0
          ? `Loading ${loadingIds.map((id) => MODEL_INFO[id].label).join(' and ')} model…`
          : !ready
            ? 'No sign model could be loaded'
            : signing
              ? '● Watching your sign…'
              : 'Raise your hands, sign, then lower them out of view'}
      </p>
      {activeIds.map((id) =>
        errors[id] ? (
          <p key={id} className="recognizer-meta">
            {MODEL_INFO[id].label}: {errors[id]}
          </p>
        ) : null,
      )}

      <nav className="recognizer-scope" aria-label="Model">
        <span>Model:</span>
        {(['both', 'kaggle', 'citizen'] as Choice[]).map((c) => (
          <button key={c} aria-pressed={choice === c} onClick={() => change(c, scope)}>
            {c === 'both' ? 'Both' : MODEL_INFO[c].label}
          </button>
        ))}
      </nav>
      <nav className="recognizer-scope" aria-label="Compare with">
        <span>Compare with:</span>
        <button aria-pressed={scope === 'all'} onClick={() => change(choice, 'all')}>
          All signs
        </button>
        <button aria-pressed={scope === 'vocab'} onClick={() => change(choice, 'vocab')}>
          Our vocabulary
        </button>
      </nav>

      {main && (
        <h2 className="recognizer-main" aria-live="polite">
          {unsure
            ? 'Not sure — try again or fingerspell'
            : `${main.name}${choice === 'both' ? ` (${MODEL_INFO[main.id].label})` : ''}`}
        </h2>
      )}

      <div className="recognizer-cards">
        {activeIds.map((id) => {
          const p = results[id]
          const model = models[id]
          if (!p || !model) return null
          const best = p.guesses[0]
          return (
            <section key={id} className="recognizer-result">
              <h3>
                {MODEL_INFO[id].label} · {model.knownSigns.length} signs
              </h3>
              <ol>
                {p.guesses.map((g) => (
                  <li key={g.sign}>
                    <span className="recognizer-sign">{displayName(id, g.sign)}</span>
                    <span className="recognizer-bar">
                      <span style={{ width: `${Math.round(g.probability * 100)}%` }} />
                    </span>
                    <span className="recognizer-pct">{Math.round(g.probability * 100)}%</span>
                  </li>
                ))}
              </ol>
              <p className="recognizer-meta">
                {/* Only worth saying when the overall best isn't already the top guess */}
                {p.bestOverall.sign !== best?.sign &&
                  `Best of all: ${displayName(id, p.bestOverall.sign)} (${Math.round(p.bestOverall.probability * 100)}%) · `}
                {p.ms} ms
              </p>
            </section>
          )
        })}
      </div>

      {history.length > 0 && (
        <p className="recognizer-history">
          Recognized: {history.join(' ')}{' '}
          <button onClick={() => setHistory([])}>Clear</button>
        </p>
      )}

      {activeIds.map((id) => {
        const model = models[id]
        if (!model) return null
        const covered = coverage(id, model)
        return (
          <p key={id} className="recognizer-meta">
            {MODEL_INFO[id].label} knows {covered.length} of our {VOCABULARY.length} signs
            {covered.length < VOCABULARY.length && `: ${covered.join(', ')}`}
          </p>
        )
      })}
    </div>
  )
}

// The single answer to show big: the most confident top guess across the models
function mainAnswer(results: Results) {
  let main: { id: ModelId; name: string; probability: number } | null = null
  for (const id of Object.keys(results) as ModelId[]) {
    const best = results[id]?.guesses[0]
    if (best && (!main || best.probability > main.probability)) {
      main = { id, name: displayName(id, best.sign), probability: best.probability }
    }
  }
  return main
}
// What's new compared with the old version:
// - Both models load separately. If one fails, for example because its files are missing, the other still works, and the page shows which one failed.
// - The model switch has three options: Both (the default), Kaggle and ASL Citizen.
// - The main answer: in Both mode, the big heading shows whichever model is more confident, and names that model, for example "COFFEE (ASL Citizen)".
// - One card per model with its own top 3, shown side by side.
// - Each model's names are converted to yours, so ASL Citizen's BIG shows as LARGE and MILK2 shows as MILK.