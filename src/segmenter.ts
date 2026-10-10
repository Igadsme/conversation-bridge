// STEP 8 - Cut continuous video into one clip per sign.
//
// Rule: a sign starts when a hand comes into view and ends when both hands
// have been out of view for a short moment. So the signer raises their hands,
// signs, and lowers them out of frame (or into their lap) between signs.
//
//   idle --(hand seen for START_FRAMES)--> signing --(no hands for END_FRAMES)--> clip ready
//
// Too-short clips are dropped as noise, too-long clips are cut off.

const START_FRAMES = 2 // hand must be seen this many frames in a row to start
const END_FRAMES = 8 // ~0.25 s at 30 fps without hands ends the sign
const MIN_FRAMES = 5 // shorter clips are noise (a hand passing by)
const MAX_FRAMES = 150 // ~5 s: send what we have if hands never drop

export class Segmenter {
  private clip: Float32Array[] = []
  private handFrames = 0 // hand seen this many frames in a row (while idle)
  private emptyFrames = 0 // no hands this many frames in a row (while signing)
  private signing = false

  get isSigning(): boolean {
    return this.signing
  }

  get length(): number {
    return this.clip.length
  }

  // Feed one frame. Returns a finished clip when a sign ends, otherwise null.
  push(frame: Float32Array, handsVisible: boolean): Float32Array[] | null {
    if (!this.signing) {
      this.handFrames = handsVisible ? this.handFrames + 1 : 0
      if (this.handFrames < START_FRAMES) return null
      this.signing = true
      this.emptyFrames = 0
      this.clip = []
    }

    this.clip.push(frame)
    this.emptyFrames = handsVisible ? 0 : this.emptyFrames + 1

    if (this.emptyFrames >= END_FRAMES || this.clip.length >= MAX_FRAMES) {
      // Drop the trailing hand-less frames; they aren't part of the sign
      const clip = this.clip.slice(0, this.clip.length - this.emptyFrames)
      this.reset()
      return clip.length >= MIN_FRAMES ? clip : null
    }
    return null
  }

  reset() {
    this.clip = []
    this.signing = false
    this.handFrames = 0
    this.emptyFrames = 0
  }
}
