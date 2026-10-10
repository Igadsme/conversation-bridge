// ASL CITIZEN B4 - Run Microsoft's ASL Citizen sign model in the browser.
//
// The model (converted to ONNX by scripts/convert_asl_citizen.py) takes one clip
// as [1, 2, 128, 27]: x and y of 27 body and hand points over exactly 128 frames,
// and returns one score for each of its 2,731 signs.
//
// preprocess() copies Microsoft's asl_citizen_dataset_pose.py step by step (and our
// Python reference, scripts/check_asl_citizen.py). Any difference makes the model
// quietly give wrong answers, so keep the two in sync.
// Tested in Chrome: same top 3 as Python on 5 ASL Citizen test clips.
//
// Files (copied by scripts/setup_model.sh, git-ignored - license: no redistribution):
//   public/models/asl_citizen.onnx          the model
//   public/models/asl_citizen_labels.json   ["sign name", ...] in the model's order

import * as ort from 'onnxruntime-web'
import { softmax, type Guess, type Prediction } from './signmodel'
import { ASL_CITIZEN_NAMES } from './signs'

// Keep this version in sync with onnxruntime-web in package.json
const ORT_WASM_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'
const MODEL_URL = '/models/asl_citizen.onnx'
const LABELS_URL = '/models/asl_citizen_labels.json'

const MAX_FRAMES = 128 // every clip is stretched or padded to this many frames
const STORED_POINTS = 75 // their saved order: pose 0-32, RIGHT hand 33-53, LEFT hand 54-74
// Their 27 points, numbered in the order [pose 0-32, left hand 33-53, right hand 54-74]
const KEYPOINTS = [0, 2, 5, 11, 12, 13, 14, 33, 37, 38, 41, 42, 45, 46, 49, 50, 53, 54,
  58, 59, 62, 63, 66, 67, 70, 71, 74]

// Where each part sits in our 543-point frame (see landmarks.ts)
const LEFT_HAND_START = 468
const POSE_START = 489
const RIGHT_HAND_START = 522

// ASL Citizen's name -> ours, e.g. "MILK2" -> "MILK", "BIG" -> "LARGE"
const ourNameFor = new Map(
  Object.entries(ASL_CITIZEN_NAMES).flatMap(([ours, theirs]) => theirs.map((t) => [t, ours] as const)),
)
export const aslCitizenToOurs = (sign: string) => ourNameFor.get(sign)

// 1. One 543-point frame -> their saved layout: 75 points of x/y, missing points = 0
function toStored(frame: Float32Array): Float32Array {
  const stored = new Float32Array(STORED_POINTS * 2)
  function copy(from: number, count: number, to: number) {
    for (let i = 0; i < count; i++) {
      const x = frame[(from + i) * 3]
      const y = frame[(from + i) * 3 + 1]
      stored[(to + i) * 2] = Number.isNaN(x) ? 0 : x
      stored[(to + i) * 2 + 1] = Number.isNaN(y) ? 0 : y
    }
  }
  copy(POSE_START, 33, 0)
  copy(RIGHT_HAND_START, 21, 33)
  copy(LEFT_HAND_START, 21, 54)
  return stored
}

// 2. Long clips: keep evenly spaced frames until there are 128 (their downsample())
function downsample(frames: Float32Array[]): Float32Array[] {
  const increment = Math.min(MAX_FRAMES / frames.length, 1)
  let currIncrement = 0
  let currFrame = 0
  const kept: Float32Array[] = []
  for (const frame of frames) {
    currIncrement += increment
    if (currIncrement > currFrame) {
      currFrame += 1
      kept.push(frame)
    }
  }
  return kept.slice(0, MAX_FRAMES)
}

// The whole recipe: a clip of 543-point frames -> the model input [2][128][27]
export function preprocess(clip: Float32Array[]): Float32Array {
  let frames = clip.map(toStored)
  if (frames.length > MAX_FRAMES) frames = downsample(frames)
  // Short clips: pad with all-zero frames at the end
  while (frames.length < MAX_FRAMES) frames.push(new Float32Array(STORED_POINTS * 2))

  // 3. Centre on the average point between the shoulders (points 11 and 12) and
  //    scale by the average shoulder width. Like theirs, this includes padding frames.
  let centerX = 0
  let centerY = 0
  let width = 0
  for (const f of frames) {
    const [lx, ly, rx, ry] = [f[22], f[23], f[24], f[25]]
    centerX += (lx + rx) / 2
    centerY += (ly + ry) / 2
    width += Math.hypot(lx - rx, ly - ry)
  }
  centerX /= MAX_FRAMES
  centerY /= MAX_FRAMES
  width /= MAX_FRAMES

  // 4. Their order is [pose, left hand, right hand]; map that back to the saved order
  const storedIndex = (i: number) => (i < 33 ? i : i < 54 ? i + 21 : i - 21)

  // 5. Keep their 27 points and lay them out as [x or y][frame][point]
  const n = KEYPOINTS.length
  const input = new Float32Array(2 * MAX_FRAMES * n)
  frames.forEach((f, t) => {
    KEYPOINTS.forEach((k, j) => {
      const s = storedIndex(k)
      let x = f[s * 2]
      let y = f[s * 2 + 1]
      if (width !== 0) {
        x = (x - centerX) / width
        y = (y - centerY) / width
      }
      input[t * n + j] = x
      input[MAX_FRAMES * n + t * n + j] = y
    })
  })
  return input
}

// Shared across callers: React runs effects twice in dev
let loading: Promise<AslCitizenModel> | null = null

export class AslCitizenModel {
  private readonly session: ort.InferenceSession
  private readonly labels: string[] // index -> sign name

  private constructor(session: ort.InferenceSession, labels: string[]) {
    this.session = session
    this.labels = labels
  }

  static load(): Promise<AslCitizenModel> {
    loading ??= AslCitizenModel.loadFiles().catch((err) => {
      loading = null // allow a retry after a failure
      throw err
    })
    return loading
  }

  private static async loadFiles(): Promise<AslCitizenModel> {
    ort.env.wasm.wasmPaths = ORT_WASM_URL
    const labelsResponse = await fetch(LABELS_URL)
    if (!labelsResponse.ok) throw new Error('ASL Citizen model files missing. Run: sh scripts/setup_model.sh')
    const labels: string[] = await labelsResponse.json()
    const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] })
    return new AslCitizenModel(session, labels)
  }

  // Every sign the model knows, in ASL Citizen's spelling
  get knownSigns(): string[] {
    return this.labels
  }

  // Same shape as SignModel.predict, so the Recognize page can use either model.
  // With a vocabulary, only our signs are ranked, and each of our signs appears
  // once (its best variant, e.g. MILK1 or MILK2).
  async predict(clip: Float32Array[], vocabulary?: string[], top = 3): Promise<Prediction> {
    const t0 = performance.now()
    const input = new ort.Tensor('float32', preprocess(clip), [1, 2, MAX_FRAMES, KEYPOINTS.length])
    const results = await this.session.run({ inputs: input })
    const probabilities = softmax(results.outputs.data as Float32Array)

    const all: Guess[] = this.labels
      .map((sign, i) => ({ sign, probability: probabilities[i] }))
      .sort((a, b) => b.probability - a.probability)

    let guesses = all
    if (vocabulary) {
      const wanted = new Set(vocabulary)
      const seen = new Set<string>()
      guesses = all.filter((g) => {
        const ours = aslCitizenToOurs(g.sign)
        if (!ours || !wanted.has(ours) || seen.has(ours)) return false
        seen.add(ours)
        return true
      })
    }
    return {
      guesses: guesses.slice(0, top),
      bestOverall: all[0],
      frames: clip.length,
      ms: Math.round(performance.now() - t0),
    }
  }
}