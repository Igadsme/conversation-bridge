// STEP 6 - Convert a HolisticLandmarker result into the Kaggle model's input.
//
// The 1st place model expects every frame as 543 landmarks x (x, y, z), in the
// same fixed order MediaPipe Holistic used for the training data:
//   face 0-467 | left hand 468-488 | pose 489-521 | right hand 522-542
// Anything not detected in a frame is NaN, exactly like the Kaggle data.

import type { HolisticLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

export const ROWS_PER_FRAME = 543

// Where each body part starts in the 543 rows, and how many points it has
const FACE = { start: 0, count: 468 }
const LEFT_HAND = { start: 468, count: 21 }
const POSE = { start: 489, count: 33 }
const RIGHT_HAND = { start: 522, count: 21 }

// One frame as a flat array: [x0, y0, z0, x1, y1, z1, ...], 543 * 3 numbers
export function toModelFrame(result: HolisticLandmarkerResult): Float32Array {
  const frame = new Float32Array(ROWS_PER_FRAME * 3).fill(NaN)

  function write(points: NormalizedLandmark[] | undefined, part: { start: number; count: number }) {
    if (!points) return // part not detected: leave it as NaN
    // Only the first `count` points: for the face this drops the 10 iris points
    // (the new face model returns 478, the training data has 468)
    for (let i = 0; i < part.count && i < points.length; i++) {
      const offset = (part.start + i) * 3
      frame[offset] = points[i].x
      frame[offset + 1] = points[i].y
      frame[offset + 2] = points[i].z
    }
  }

  write(result.faceLandmarks[0], FACE)
  write(result.leftHandLandmarks[0], LEFT_HAND)
  write(result.poseLandmarks[0], POSE)
  write(result.rightHandLandmarks[0], RIGHT_HAND)
  return frame
}
