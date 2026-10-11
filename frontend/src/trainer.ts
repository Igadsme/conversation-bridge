// PERSONAL CALIBRATION 4 - Train the personal model in the browser.
//
// The same recipe as scripts/train_personal.py, so the signer can press
// "Train my model" instead of running Python:
//   1. every clip's ASL Citizen features (256 numbers, see aslcitizenmodel.ts)
//   2. scaled like scikit-learn's StandardScaler
//   3. a logistic regression (softmax, L2 penalty with C = 1) learns which
//      features mean which of the signer's signs
// It also holds back TEST_PER_SIGN clips of every sign a few times and reports
// how many it gets right, and which signs get mixed up.
//
// The result has the same shape as personal_model.json, so PersonalModel uses
// either one. Plain math, no camera or model files, so it runs in tests too.

import type { SavedModel } from './personalmodel'
import { COMPACT_PARTS, clipKey, type PersonalClip } from './signs'

export const MIN_EXAMPLES = 8 // signs with fewer recordings are skipped
const TEST_PER_SIGN = 3 // held back from training in each check round
const ROUNDS = 5 // check rounds, each with a different random split
const STEPS = 400 // training steps (each looks at every clip)
const LEARNING_RATE = 0.05
const C = 1 // like scikit-learn's LogisticRegression(C=1.0)

// One sign example, already described by ASL Citizen
export type Sample = { sign: string; features: ArrayLike<number> }

export type TrainingReport = {
  model: SavedModel
  signs: number
  clips: number
  accuracy: number // share of held-back clips recognized correctly
  tested: number // held-back clips over all rounds
  mixups: { sign: string; guess: string; count: number }[] // most common first
  skipped: Record<string, number> // signs with fewer than MIN_EXAMPLES clips
}

// A recorded frame (150 numbers, see PersonalClip) -> the app's 543-point frame,
// NaN where a point wasn't seen, so it can go through AslCitizenModel.predict
export function expandFrame(compact: (number | null)[]): Float32Array {
  const frame = new Float32Array(543 * 3).fill(NaN)
  let k = 0
  for (const part of COMPACT_PARTS) {
    for (let i = 0; i < part.count; i++) {
      frame[(part.start + i) * 3] = compact[k++] ?? NaN
      frame[(part.start + i) * 3 + 1] = compact[k++] ?? NaN
    }
  }
  return frame
}

// The same clip can be in several downloaded files: keep each one once
export function dedupe<T extends PersonalClip>(clips: T[]): T[] {
  const seen = new Set<string>()
  return clips.filter((c) => {
    const key = clipKey(c)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Small seeded random numbers, so a check gives the same answer every run
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Like StandardScaler: average and spread of each feature (a spread of 0 -> 1)
function fitScaler(rows: Float64Array[]) {
  const d = rows[0].length
  const mean = new Float64Array(d)
  const scale = new Float64Array(d)
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j] / rows.length
  for (const r of rows) for (let j = 0; j < d; j++) scale[j] += (r[j] - mean[j]) ** 2 / rows.length
  for (let j = 0; j < d; j++) scale[j] = Math.sqrt(scale[j]) || 1
  return { mean, scale }
}

function applyScaler(rows: Float64Array[], { mean, scale }: ReturnType<typeof fitScaler>) {
  return rows.map((r) => r.map((v, j) => (v - mean[j]) / scale[j]))
}

// Softmax scores of one clip, into `out`
function scores(x: Float64Array, w: Float64Array, b: Float64Array, out: Float64Array) {
  const d = x.length
  let max = -Infinity
  for (let k = 0; k < out.length; k++) {
    let s = b[k]
    for (let j = 0; j < d; j++) s += w[k * d + j] * x[j]
    out[k] = s
    max = Math.max(max, s)
  }
  let sum = 0
  for (let k = 0; k < out.length; k++) sum += out[k] = Math.exp(out[k] - max)
  for (let k = 0; k < out.length; k++) out[k] /= sum
}

// Logistic regression: lower the average cross-entropy plus |w|^2 / (2 C n)
// (scikit-learn's objective divided by n) with Adam steps. `tick` lets the page
// update its progress bar now and then.
async function fitLogistic(x: Float64Array[], y: number[], classes: number, tick: (done: number) => Promise<void>) {
  const n = x.length
  const d = x[0].length
  const w = new Float64Array(classes * d)
  const b = new Float64Array(classes)
  const gw = new Float64Array(w.length)
  const gb = new Float64Array(classes)
  const [mw, vw, mb, vb] = [new Float64Array(w.length), new Float64Array(w.length), new Float64Array(classes), new Float64Array(classes)]
  const p = new Float64Array(classes)
  const adam = (param: Float64Array, grad: Float64Array, m: Float64Array, v: Float64Array, t: number) => {
    for (let i = 0; i < param.length; i++) {
      m[i] = 0.9 * m[i] + 0.1 * grad[i]
      v[i] = 0.999 * v[i] + 0.001 * grad[i] ** 2
      param[i] -= (LEARNING_RATE * (m[i] / (1 - 0.9 ** t))) / (Math.sqrt(v[i] / (1 - 0.999 ** t)) + 1e-8)
    }
  }
  for (let t = 1; t <= STEPS; t++) {
    gw.fill(0)
    gb.fill(0)
    for (let i = 0; i < n; i++) {
      scores(x[i], w, b, p)
      p[y[i]] -= 1 // gradient of cross-entropy: probabilities minus the right answer
      for (let k = 0; k < classes; k++) {
        gb[k] += p[k] / n
        for (let j = 0; j < d; j++) gw[k * d + j] += (p[k] * x[i][j]) / n
      }
    }
    for (let i = 0; i < w.length; i++) gw[i] += w[i] / (C * n)
    adam(w, gw, mw, vw, t)
    adam(b, gb, mb, vb, t)
    if (t % 25 === 0) await tick(t / STEPS)
  }
  return { w, b }
}

function predict(x: Float64Array, w: Float64Array, b: Float64Array, classes: number) {
  const p = new Float64Array(classes)
  scores(x, w, b, p)
  return p.indexOf(Math.max(...p))
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

// The whole recipe. `onProgress` gets 0..1.
export async function trainPersonalModel(
  samples: Sample[],
  onProgress: (fraction: number) => void = () => {},
): Promise<TrainingReport> {
  const counts = new Map<string, number>()
  for (const s of samples) counts.set(s.sign, (counts.get(s.sign) ?? 0) + 1)
  const signs = [...counts.keys()].filter((s) => counts.get(s)! >= MIN_EXAMPLES).sort()
  const skipped = Object.fromEntries([...counts].filter(([s]) => !signs.includes(s)))
  if (signs.length < 2) {
    throw new Error(`Record at least ${MIN_EXAMPLES} examples of 2 or more signs first`)
  }

  const kept = samples.filter((s) => signs.includes(s.sign))
  const x = kept.map((s) => Float64Array.from(s.features))
  const y = kept.map((s) => signs.indexOf(s.sign))
  const bySign = signs.map((_, k) => y.flatMap((label, i) => (label === k ? [i] : [])))

  // Let the page repaint between chunks of work
  const jobs = ROUNDS + 1
  const progress = (job: number) => async (done: number) => {
    onProgress((job + done) / jobs)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  // Check: train without TEST_PER_SIGN random clips of each sign, then test on them
  const rand = random(0)
  let correct = 0
  let tested = 0
  const mixups = new Map<string, number>()
  for (let round = 0; round < ROUNDS; round++) {
    const test = new Set<number>()
    for (const indexes of bySign) {
      const shuffled = [...indexes].sort(() => rand() - 0.5)
      shuffled.slice(0, TEST_PER_SIGN).forEach((i) => test.add(i))
    }
    const train = x.flatMap((_, i) => (test.has(i) ? [] : [i]))
    const scaler = fitScaler(train.map((i) => x[i]))
    const { w, b } = await fitLogistic(applyScaler(train.map((i) => x[i]), scaler), train.map((i) => y[i]), signs.length, progress(round))
    for (const i of test) {
      const guess = predict(applyScaler([x[i]], scaler)[0], w, b, signs.length)
      tested++
      if (guess === y[i]) correct++
      else {
        const key = `${signs[y[i]]}\n${signs[guess]}`
        mixups.set(key, (mixups.get(key) ?? 0) + 1)
      }
    }
  }

  // Final model on every clip
  const scaler = fitScaler(x)
  const { w, b } = await fitLogistic(applyScaler(x, scaler), y, signs.length, progress(ROUNDS))
  const d = x[0].length
  onProgress(1)

  return {
    model: {
      signs,
      mean: Array.from(scaler.mean, round6),
      scale: Array.from(scaler.scale, round6),
      weights: signs.map((_, k) => Array.from(w.subarray(k * d, (k + 1) * d), round6)),
      bias: Array.from(b, round6),
      trainedOn: Object.fromEntries(counts),
      trainedAt: new Date().toISOString(),
    },
    signs: signs.length,
    clips: kept.length,
    accuracy: correct / tested,
    tested,
    mixups: [...mixups]
      .map(([key, count]) => {
        const [sign, guess] = key.split('\n')
        return { sign, guess, count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    skipped,
  }
}
