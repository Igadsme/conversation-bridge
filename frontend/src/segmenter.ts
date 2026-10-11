// STEP 8 - Cut continuous video into one clip per sign.
//
// Rule: a sign starts when a hand comes into view and ends when both hands
// have been out of view for a short moment. So the signer raises their hands,
// signs, and lowers them out of frame (or into their lap) between signs.
//
//   idle --(hand seen for START_FRAMES)--> signing --(no hands for END_FRAMES)--> tail --> clip ready
//
// Too-short clips are dropped as noise, too-long clips are cut off.
//
// Each finished sign gives two versions of the clip:
// - clip:   just the signing (hands visible) - used by the Kaggle model
// - padded: the same plus ~20 frames of "hands down" before and after - used by
//   ASL Citizen, which was trained on whole recordings that include those
//   resting frames. Tested on 40 ASL Citizen test videos: tight clips 32/40
//   correct, padded clips 38/40 (same as whole videos); HELLO went from
//   NONSENSE/MOOSE to HELLO.

const START_FRAMES = 2 // hand must be seen this many frames in a row to start
const END_FRAMES = 8 // ~0.25 s at 30 fps without hands ends the sign
// 8 frames (~0.27 s): shorter clips are noise, e.g. a hand passing by.
// The fastest real signs (YES, NO) are still longer than this.
const MIN_FRAMES = 8
const MAX_FRAMES = 150 // ~5 s: send what we have if hands never drop
const PAD_FRAMES = 20 // ~0.67 s of resting frames kept before and after (ASL Citizen)

export type SignClip = {
  clip: Float32Array[] // the sign itself
  padded: Float32Array[] // the sign with PAD_FRAMES before and after
  start: number // where `clip` begins inside `padded`
  end: number // where `clip` ends inside `padded` (exclusive)
}

export class Segmenter {
  private clip: Float32Array[] = []
  private recent: Float32Array[] = [] // last PAD_FRAMES frames before a sign starts
  private before: Float32Array[] = [] // the `recent` frames at the moment a sign started
  private tail: Float32Array[] = [] // frames after the sign ended, until PAD_FRAMES are collected
  private finished: Float32Array[] | null = null // the sign, waiting for its tail
  private handFrames = 0 // hand seen this many frames in a row (while idle)
  private emptyFrames = 0 // no hands this many frames in a row (while signing)
  private signing = false

  get isSigning(): boolean {
    return this.signing
  }

  // Feed one frame. Returns the finished clips when a sign ends, otherwise null.
  push(frame: Float32Array, handsVisible: boolean): SignClip | null {
    // A sign has ended: collect its tail of resting frames, then hand it over
    if (this.finished) {
      this.tail.push(frame)
      this.remember(frame)
      if (this.tail.length < PAD_FRAMES) return null
      const clip = this.finished
      const padded = [...this.before, ...clip, ...this.tail]
      const start = this.before.length
      this.finished = null
      this.tail = []
      return clip.length >= MIN_FRAMES ? { clip, padded, start, end: start + clip.length } : null
    }

    if (!this.signing) {
      this.handFrames = handsVisible ? this.handFrames + 1 : 0
      if (this.handFrames < START_FRAMES) {
        this.remember(frame)
        return null
      }
      this.signing = true
      this.emptyFrames = 0
      this.clip = []
      this.before = this.recent
      this.recent = []
    }

    this.clip.push(frame)
    this.emptyFrames = handsVisible ? 0 : this.emptyFrames + 1

    if (this.emptyFrames >= END_FRAMES || this.clip.length >= MAX_FRAMES) {
      // The hand-less frames at the end aren't part of the sign; they start the tail
      const signEnd = this.clip.length - this.emptyFrames
      this.finished = this.clip.slice(0, signEnd)
      this.tail = this.clip.slice(signEnd)
      this.clip = []
      this.signing = false
      this.handFrames = 0
      this.emptyFrames = 0
    }
    return null
  }

  // Keep the last PAD_FRAMES frames, ready to go in front of the next sign
  private remember(frame: Float32Array) {
    this.recent.push(frame)
    if (this.recent.length > PAD_FRAMES) this.recent.shift()
  }

  reset() {
    this.clip = []
    this.recent = []
    this.before = []
    this.tail = []
    this.finished = null
    this.signing = false
    this.handFrames = 0
    this.emptyFrames = 0
  }
}
