// STEP 7 - Run the 1st place Kaggle sign model in the browser with LiteRT.js.
//
// The model takes a clip of frames, [frames, 543, 3], and returns one score for
// each of its 250 signs. LiteRT.js can't run models whose frame count varies,
// so for every clip we write that clip's length into a copy of the model file
// and compile it (about 15 ms). Tested against Python: identical scores.
//
// Files (copied by scripts/setup_model.sh, git-ignored):
//   public/models/sign_model.tflite   the model
//   public/models/sign_labels.json    { "sign name": index, ... } for all 250 signs

import { loadAndCompile, loadLiteRt, Tensor } from '@litertjs/core'
import { ROWS_PER_FRAME } from './landmarks'

// Keep this version in sync with @litertjs/core in package.json
const LITERT_WASM_URL = 'https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3/wasm/'
const MODEL_URL = '/models/sign_model.tflite'
const LABELS_URL = '/models/sign_labels.json'

export type Guess = {
  sign: string // Kaggle's spelling, e.g. "thankyou"
  probability: number // 0-1, out of all 250 signs
}

export type Prediction = {
  guesses: Guess[] // best first: from our vocabulary, or from all 250 signs
  bestOverall: Guess // the best of all 250 signs, even if not in our vocabulary
  frames: number
  ms: number
  features?: Float32Array // ASL Citizen only: its 256-number description of the clip (used by PersonalModel)
}

// Our spelling -> Kaggle's spelling: "THANK-YOU" -> "thankyou"
export const toKaggleName = (sign: string) => sign.toLowerCase().replace(/-/g, '')

// The model file stores its input shape as the int32 triple [-1, 543, 3]
// (and a placeholder [1, 543, 3]). Overwrite the frame count with `frames`.
function withFrameCount(model: Uint8Array, frames: number): Uint8Array {
  const copy = model.slice()
  const view = new DataView(copy.buffer)
  for (let i = 0; i + 12 <= copy.length; i += 4) {
    const first = view.getInt32(i, true)
    if ((first === -1 || first === 1) && view.getInt32(i + 4, true) === ROWS_PER_FRAME && view.getInt32(i + 8, true) === 3) {
      view.setInt32(i, frames, true)
    }
  }
  return copy
}

// Turn raw scores (logits) into probabilities that add up to 1
export function softmax(scores: ArrayLike<number>): Float32Array {
  let max = -Infinity
  for (let i = 0; i < scores.length; i++) max = Math.max(max, scores[i])
  const out = new Float32Array(scores.length)
  let sum = 0
  for (let i = 0; i < scores.length; i++) sum += out[i] = Math.exp(scores[i] - max)
  for (let i = 0; i < out.length; i++) out[i] /= sum
  return out
}

// Shared across callers: React runs effects twice in dev, and LiteRT can only be loaded once
let loading: Promise<SignModel> | null = null

// loadLiteRt() throws "LiteRT is already loading / loaded" when called
// twice, so keep the runtime's promise here: when a retry happens after
// a failed model-file load (for example the .tflite was missing), the
// already-initialized runtime is reused instead of erroring.
let liteRt: Promise<unknown> | null = null
function ensureLiteRt(): Promise<unknown> {
  const ready: Promise<unknown> =
    liteRt ??
    loadLiteRt(LITERT_WASM_URL).catch((err) => {
      liteRt = null // allow a retry if the runtime itself failed to load
      throw err
    })
  liteRt = ready
  return ready
}

export class SignModel {
  private readonly modelBytes: Uint8Array
  private readonly labels: string[] // index -> sign name

  private constructor(modelBytes: Uint8Array, labels: string[]) {
    this.modelBytes = modelBytes
    this.labels = labels
  }

  static load(): Promise<SignModel> {
    loading ??= SignModel.loadFiles().catch((err) => {
      loading = null // allow a retry after a failure
      throw err
    })
    return loading
  }

  private static async loadFiles(): Promise<SignModel> {
    const [, modelResponse, labelsResponse] = await Promise.all([
      ensureLiteRt(),
      fetch(MODEL_URL),
      fetch(LABELS_URL),
    ])
    if (!modelResponse.ok || !labelsResponse.ok) {
      throw new Error('Sign model files missing. Run: sh scripts/setup_model.sh')
    }
    const modelBytes = new Uint8Array(await modelResponse.arrayBuffer())
    const signToIndex: Record<string, number> = await labelsResponse.json()
    const labels: string[] = []
    for (const [sign, index] of Object.entries(signToIndex)) labels[index] = sign
    return new SignModel(modelBytes, labels)
  }

  // Every sign the model knows, in Kaggle's spelling
  get knownSigns(): string[] {
    return this.labels
  }

  // Run one clip (one Float32Array of 543 * 3 per frame) and rank the signs.
  // With a vocabulary, only those signs are ranked; without one, all 250 are.
  async predict(clip: Float32Array[], vocabulary?: string[], top = 3): Promise<Prediction> {
    const t0 = performance.now()
    const frames = clip.length
    const data = new Float32Array(frames * ROWS_PER_FRAME * 3)
    clip.forEach((frame, i) => data.set(frame, i * ROWS_PER_FRAME * 3))

    const model = await loadAndCompile(withFrameCount(this.modelBytes, frames), { accelerator: 'wasm' })
    const input = new Tensor(data, [frames, ROWS_PER_FRAME, 3])
    let probabilities: Float32Array
    try {
      const [output] = await model.run(input)
      probabilities = softmax(await output.data())
      output.delete()
    } finally {
      input.delete()
      model.delete()
    }

    const rank = (indexes: number[]) =>
      indexes
        .map((i) => ({ sign: this.labels[i], probability: probabilities[i] }))
        .sort((a, b) => b.probability - a.probability)

    const all = rank(this.labels.map((_, i) => i))
    const wanted = vocabulary && new Set(vocabulary.map(toKaggleName))
    return {
      guesses: (wanted ? all.filter((g) => wanted.has(g.sign)) : all).slice(0, top),
      bestOverall: all[0],
      frames,
      ms: Math.round(performance.now() - t0),
    }
  }
}
