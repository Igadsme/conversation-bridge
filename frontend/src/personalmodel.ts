// PERSONAL CALIBRATION 3 - The signer's own classifier, in the browser.
//
// scripts/train_personal.py trains a logistic regression on ASL Citizen's
// 256-number description ("features") of each recorded clip, and saves it as
// personal_model.json. Here we apply it: scale the features the same way,
// score each sign (weights x features + bias), softmax -> probabilities.
// It only knows the signs that were recorded (and NOT-A-SIGN, once recorded).
//
// Where the model comes from, first found wins:
//   1. trained in this browser with "Train my model" (trainer.ts, kept by clipstore.ts)
//   2. public/models/personal_model.json (copied by scripts/setup_model.sh,
//      git-ignored - it's personal data)

import { AslCitizenModel } from './aslcitizenmodel'
import { loadModel } from './clipstore'
import { softmax, type Prediction } from './signmodel'

const MODEL_URL = '/models/personal_model.json'

// What scripts/train_personal.py and trainer.ts save
export type SavedModel = {
  signs: string[] // our names, e.g. "COFFEE", or "NOT-A-SIGN"
  mean: number[] // 256 numbers: feature averages, for scaling
  scale: number[] // 256 numbers: feature spreads, for scaling
  weights: number[][] // one row of 256 per sign
  bias: number[] // one per sign
  trainedOn: Record<string, number> // clips per sign
  trainedAt?: string // set by trainer.ts
}

// Shared across callers: React runs effects twice in dev
let loading: Promise<PersonalModel> | null = null

export class PersonalModel {
  private readonly saved: SavedModel

  private constructor(saved: SavedModel) {
    this.saved = saved
  }

  static load(): Promise<PersonalModel> {
    loading ??= (async () => {
      const trainedHere = await loadModel().catch(() => undefined)
      if (trainedHere) return new PersonalModel(trainedHere)
      const response = await fetch(MODEL_URL)
      if (!response.ok) {
        throw new Error('Personal model missing. Train one on the Personal Training page, or run python scripts/train_personal.py, then sh scripts/setup_model.sh')
      }
      return new PersonalModel(await response.json())
    })().catch((err) => {
      loading = null // allow a retry after a failure
      throw err
    })
    return loading
  }

  // Use a model just trained (or forget it, with null), without reloading the page
  static replace(saved: SavedModel | null) {
    loading = saved ? Promise.resolve(new PersonalModel(saved)) : null
  }

  // The signs this signer recorded, in our spelling
  get knownSigns(): string[] {
    return this.saved.signs
  }

  // Classify one clip from ASL Citizen's features (already computed for that clip)
  classify(features: Float32Array, frames: number, top = 3): Prediction {
    const t0 = performance.now()
    const { signs, mean, scale, weights, bias } = this.saved
    const scaled = Array.from(features, (f, i) => (f - mean[i]) / scale[i])
    const scores = weights.map((row, k) => row.reduce((sum, w, i) => sum + w * scaled[i], bias[k]))
    // With only two signs, scikit-learn saves one row: the score for the second sign
    // (trainer.ts always saves one row per sign)
    const probabilities = weights.length === 1 ? softmax([0, scores[0]]) : softmax(scores)
    const all = signs
      .map((sign, k) => ({ sign, probability: probabilities[k] }))
      .sort((a, b) => b.probability - a.probability)
    return { guesses: all.slice(0, top), bestOverall: all[0], frames, ms: Math.round(performance.now() - t0) }
  }

  // Same shape as the other models: runs ASL Citizen first to get the features.
  // (The Recognize page skips this when ASL Citizen has already run on the clip.)
  async predict(clip: Float32Array[]): Promise<Prediction> {
    const t0 = performance.now()
    const citizen = await (await AslCitizenModel.load()).predict(clip)
    const prediction = this.classify(citizen.features!, clip.length)
    return { ...prediction, ms: Math.round(performance.now() - t0) }
  }
}
