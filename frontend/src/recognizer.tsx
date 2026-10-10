// STEP 8 - Live sign recognition, with three models (ASL CITIZEN B5 + PERSONAL CALIBRATION 3).
// CameraView gives us each frame in the 543-point format; the Segmenter cuts the
// stream into one clip per sign (hands up -> sign -> hands down); the chosen
// model(s) rank the signs for that clip and we show the top 3 from each.
//
// Switches:
// - Model: Kaggle (250 signs), ASL Citizen (2,731 signs), Personal (the signer's
//   own recorded signs, PERSONAL CALIBRATION 3), or Combined (all side by side).
//   In Combined, the main answer is the Personal one when it's confident;
//   otherwise Kaggle for the signs it knows, otherwise ASL Citizen
//   (see mainAnswer at the bottom).
// - Compare with: all the signs a model knows, or only our vocabulary.
//
// Confidence is the model's probability over all its signs. Below UNSURE_BELOW
// we say "not sure" instead of guessing (fingerspelling comes later).
//
// SENTENCE A: confident answers are added to the sentence builder (see
// sentencebuilder.tsx), where the signer can swap or remove signs, then press
// Done. Tapping any guess in the model cards adds that sign too.
// Tested with ASL Citizen test videos as a fake webcam: HELLO (Kaggle) and
// COFFEE (ASL Citizen) recognized; LARGE came out "not sure" (7-10%).

import { useEffect, useRef, useState } from 'react'
import type { HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import CameraView from './cameraview'
import { Segmenter, type SignClip } from './segmenter'
import { SignModel, toKaggleName, type Prediction } from './signmodel'
import { AslCitizenModel, aslCitizenToOurs } from './aslcitizenmodel'
import { PersonalModel } from './personalmodel'
import { ASL_CITIZEN_NAMES, NOT_A_SIGN, VOCABULARY } from './signs'
import SentenceBuilder, { type Chip } from './sentencebuilder'
import './recognizer.css'

const UNSURE_BELOW = 0.3
// The personal model always picks one of its few signs, so it must be this sure
// before its answer beats the other models (until NOT-A-SIGN is recorded, it
// can't tell "not a sign" apart at all)
const PERSONAL_SURE = 0.7

// STABILIZATION - ignore an automatically added sign when the same sign was
// added within this window. A hand dipping out of view for a moment (END_FRAMES)
// cuts one sign into two clips, and the second clip is usually the same sign
// again. A deliberate repeat takes longer: hands down, raise, sign again.
const REPEAT_WINDOW_MS = 1500

type Scope = 'all' | 'vocab'
type ModelId = 'kaggle' | 'citizen' | 'personal'
type Choice = ModelId | 'both'
const ALL_MODELS: ModelId[] = ['kaggle', 'citizen', 'personal'] // citizen before personal: personal reuses its features

// What the page needs from each model (SignModel, AslCitizenModel and PersonalModel all fit)
type Recognizer = {
  knownSigns: string[]
  predict(clip: Float32Array[], vocabulary?: string[]): Promise<Prediction>
}

// Each model spells signs its own way; turn them into our names for display
const kaggleToOurs = new Map(VOCABULARY.map((s) => [toKaggleName(s), s]))
const MODEL_INFO: Record<ModelId, { label: string; toOurs: (sign: string) => string | undefined }> = {
  kaggle: { label: 'Kaggle', toOurs: (s) => kaggleToOurs.get(s) },
  citizen: { label: 'ASL Citizen', toOurs: aslCitizenToOurs },
  personal: { label: 'Personal', toOurs: (s) => s }, // already our names
}
const displayName = (id: ModelId, sign: string) => MODEL_INFO[id].toOurs(sign) ?? sign.toUpperCase()

// Which of our signs each model knows
function coverage(id: ModelId, model: Recognizer): string[] {
  const known = new Set(model.knownSigns)
  return VOCABULARY.filter((s) =>
    id === 'kaggle'
      ? known.has(toKaggleName(s))
      : id === 'personal'
        ? known.has(s)
        : (ASL_CITIZEN_NAMES[s] ?? []).some((n) => known.has(n)),
  )
}

type Results = Partial<Record<ModelId, Prediction>>

type Props = {
  onApprovedSentence?: (sentence: string) => void
}

export default function RecognizerPage({ onApprovedSentence }: Props) {
  const [models, setModels] = useState<Partial<Record<ModelId, Recognizer>>>({})
  const [errors, setErrors] = useState<Partial<Record<ModelId, string>>>({})
  const [choice, setChoice] = useState<Choice>('both')
  const [scope, setScope] = useState<Scope>('all')
  const [signing, setSigning] = useState(false)
  const [results, setResults] = useState<Results>({})
  // SENTENCE A: the sentence being built, and whether Done was pressed
  const [chips, setChips] = useState<Chip[]>([])
  const [sentenceDone, setSentenceDone] = useState(false)
  const nextChipId = useRef(1)
  const segmenterRef = useRef(new Segmenter())
  // The last clip, so changing a switch can re-rank it straight away
  const lastClipRef = useRef<SignClip | null>(null)
  // Clips are predicted one at a time, in order
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  // STABILIZATION: the last sign added to the sentence, and when
  const lastAddedRef = useRef<{ sign: string; at: number } | null>(null)
  // A transient note (ignored repeats), shown under the status line
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  function showNotice(text: string) {
    setNotice(text)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3000)
  }

  // Load every model; each one works on its own if another fails
  useEffect(() => {
    const loaders: Record<ModelId, () => Promise<Recognizer>> = {
      kaggle: () => SignModel.load(),
      citizen: () => AslCitizenModel.load(),
      personal: () => PersonalModel.load(),
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

  const activeIds: ModelId[] = choice === 'both' ? ALL_MODELS : [choice]
  const ready = activeIds.some((id) => models[id])

  // Called by CameraView for every video frame
  function handleFrame(result: HolisticLandmarkerResult, modelFrame: Float32Array) {
    if (!ready) return
    const segmenter = segmenterRef.current
    const handsVisible = result.leftHandLandmarks.length > 0 || result.rightHandLandmarks.length > 0
    const clips = segmenter.push(modelFrame, handsVisible)

    // Only re-render when the signing state flips, not on every frame
    if (segmenter.isSigning !== signing) setSigning(segmenter.isSigning)

    if (clips) {
      lastClipRef.current = clips
      runPrediction(clips, activeIds, scope, true)
    }
  }

  // Rank a clip with each chosen model; `addToHistory` is false when re-ranking
  // Kaggle gets the tight clip; ASL Citizen gets it with resting frames around it
  // (it was trained on whole recordings - see segmenter.ts)
  function runPrediction(clips: SignClip, ids: ModelId[], scope: Scope, addToHistory: boolean) {
    queueRef.current = queueRef.current.then(async () => {
      const next: Results = {}
      for (const id of ids) {
        const model = models[id]
        if (!model) continue
        try {
          const clip = id === 'kaggle' ? clips.clip : clips.padded
          const features = next.citizen?.features
          if (id === 'personal' && features && model instanceof PersonalModel) {
            // ASL Citizen already described this clip: just classify that
            next[id] = model.classify(features, clip.length)
          } else {
            next[id] = await model.predict(clip, scope === 'vocab' ? VOCABULARY : undefined)
          }
        } catch (err) {
          console.error(`${MODEL_INFO[id].label} prediction failed`, err)
        }
      }
      setResults(next)
      const main = mainAnswer(next)
      if (addToHistory && main && main.probability >= UNSURE_BELOW) {
        addChip(main.name, alternativesFor(next, main.name), MODEL_INFO[main.id].label, true)
      }
    })
  }

  // SENTENCE A: add a sign to the sentence (ignored once Done was pressed).
  // `automatic` marks additions from live recognition: those are suppressed
  // when the same sign was just added (see REPEAT_WINDOW_MS). Tapping a guess
  // in the model cards is always allowed - that is explicit intent.
  function addChip(sign: string, alternatives: string[], from: string, automatic = false) {
    if (sentenceDone) return
    if (automatic) {
      const last = lastAddedRef.current
      if (last && last.sign === sign && Date.now() - last.at < REPEAT_WINDOW_MS) {
        showNotice(`Repeated ${sign} ignored — sign it again in a moment to add it twice`)
        return
      }
    }
    lastAddedRef.current = { sign, at: Date.now() }
    setChips((prev) => [...prev, { id: nextChipId.current++, sign, alternatives, from }])
  }

  function swapChip(id: number, sign: string) {
    setChips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, sign, alternatives: [c.sign, ...c.alternatives.filter((a) => a !== sign)] } : c)),
    )
  }

  function clearSentence() {
    setChips([])
    setSentenceDone(false)
    lastAddedRef.current = null
  }

  function change(nextChoice: Choice, nextScope: Scope) {
    setChoice(nextChoice)
    setScope(nextScope)
    const ids: ModelId[] = nextChoice === 'both' ? ALL_MODELS : [nextChoice]
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
      {notice && <p className="recognizer-note" role="status">{notice}</p>}
      {activeIds.map((id) =>
        errors[id] ? (
          <p key={id} className="recognizer-meta">
            {MODEL_INFO[id].label}: {errors[id]}
          </p>
        ) : null,
      )}
      {errors.kaggle && choice === 'both' && (
        <p className="recognizer-meta">
          Combined mode still answers with ASL Citizen and Personal. Run sh scripts/setup_model.sh to add the Kaggle model.
        </p>
      )}

      <nav className="recognizer-scope" aria-label="Model">
        <span>Model:</span>
        {(['both', 'kaggle', 'citizen', 'personal'] as Choice[]).map((c) => (
          <button key={c} aria-pressed={choice === c} onClick={() => change(c, scope)}>
            {c === 'both' ? 'Combined' : MODEL_INFO[c].label}
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
                {p.guesses.map((g) => {
                  const name = displayName(id, g.sign)
                  return (
                    <li key={g.sign}>
                      {/* SENTENCE A: tap a guess to add it to the sentence */}
                      <button
                        className="recognizer-guess"
                        onClick={() => addChip(name, alternativesFor(results, name), MODEL_INFO[id].label)}
                        disabled={sentenceDone || name === NOT_A_SIGN}
                        title={`Add ${name} to the sentence`}
                      >
                        <span className="recognizer-sign">{name}</span>
                        <span className="recognizer-bar">
                          <span style={{ width: `${Math.round(g.probability * 100)}%` }} />
                        </span>
                        <span className="recognizer-pct">{Math.round(g.probability * 100)}%</span>
                      </button>
                    </li>
                  )
                })}
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

      <SentenceBuilder
        chips={chips}
        done={sentenceDone}
        onSwap={swapChip}
        onRemove={(chipId) => setChips((prev) => prev.filter((c) => c.id !== chipId))}
        onClear={clearSentence}
        onDone={() => setSentenceDone(true)}
        onEdit={() => setSentenceDone(false)}
        onApproved={onApprovedSentence}
      />

      {activeIds.map((id) => {
        const model = models[id]
        if (!model) return null
        const covered = coverage(id, model)
        // CUSTOM SIGNS: the personal model can also know your own words and phrases
        const own = id === 'personal' ? model.knownSigns.filter((s) => !VOCABULARY.includes(s) && s !== NOT_A_SIGN) : []
        return (
          <p key={id} className="recognizer-meta">
            {MODEL_INFO[id].label} knows {covered.length} of our {VOCABULARY.length} signs
            {covered.length < VOCABULARY.length && `: ${covered.join(', ')}`}
            {own.length > 0 && ` + your own: ${own.join(', ')}`}
          </p>
        )
      })}
    </div>
  )
}

// SENTENCE A: the other guesses for the same clip, from every model, best first,
// in our spelling, without the chosen sign or NOT-A-SIGN - offered as swaps
function alternativesFor(results: Results, chosen: string): string[] {
  const seen = new Set([chosen, NOT_A_SIGN])
  const out: string[] = []
  for (const id of ['personal', 'kaggle', 'citizen'] as ModelId[]) {
    for (const g of results[id]?.guesses ?? []) {
      const name = displayName(id, g.sign)
      if (!seen.has(name)) {
        seen.add(name)
        out.push(name)
      }
    }
  }
  return out.slice(0, 5)
}

// The single answer to show big. Each model is trusted for what it's best at:
// - Kaggle, when its top guess is one of our signs it knows (HELLO, THANK-YOU...).
//   It's more accurate on those; ASL Citizen confuses e.g. HELLO with NONSENSE.
// - ASL Citizen otherwise (COFFEE, TEA, SMALL... which Kaggle doesn't know).
// Comparing their percentages directly doesn't work: one picks from 250 signs,
// the other from 2,731, so their confidence means different things.
function mainAnswer(results: Results) {
  const answer = (id: ModelId) => {
    const best = results[id]?.guesses[0]
    return best ? { id, name: displayName(id, best.sign), probability: best.probability } : null
  }
  // PERSONAL CALIBRATION 3: trained on this signer, so a confident answer wins.
  // NOT-A-SIGN means "this wasn't a sign": show "not sure" (probability 0).
  const personal = answer('personal')
  if (personal && personal.probability >= PERSONAL_SURE) {
    return personal.name === NOT_A_SIGN ? { ...personal, probability: 0 } : personal
  }
  const kaggle = answer('kaggle')
  if (kaggle && kaggle.probability >= UNSURE_BELOW && kaggleToOurs.has(results.kaggle!.guesses[0].sign)) {
    return kaggle
  }
  return answer('citizen') ?? kaggle
}

// What's new compared with the old version:
// - Both models load separately. If one fails, for example because its files are missing, the other still works, and the page shows which one failed.
// - The model switch has three options: Both (the default), Kaggle and ASL Citizen.
// - The main answer: in Both mode, the big heading comes from Kaggle for the signs it knows (e.g. HELLO), otherwise from ASL Citizen (e.g. COFFEE), and names that model, for example "COFFEE (ASL Citizen)".
// - One card per model with its own top 3, shown side by side.
// - Each model's names are converted to yours, so ASL Citizen's BIG shows as LARGE and MILK2 shows as MILK.
