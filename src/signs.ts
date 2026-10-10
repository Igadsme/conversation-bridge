// STEP 4 - Shared sign vocabulary and the shape of a recorded example.
// Used by the recorder now, and by the matcher in step 5.

// Starter vocabulary for the coffee counter setting
export const VOCABULARY = [
  'HELLO', 'THANK-YOU', 'PLEASE',
  'COFFEE', 'TEA', 'WATER', 'MILK',
  'SMALL', 'MEDIUM', 'LARGE',
  'HOT', 'COLD',
  'MORE', 'LESS', 'SUGAR',
  'WAIT', 'AGAIN', 'YES', 'NO', 'HELP',
]

// One landmark: x and y are 0–1 fractions of the image, z is relative depth
export type Point = [number, number, number]

export type HandFrame = {
  handedness: string // "Left" or "Right" as MediaPipe reports it
  points: Point[] // 21 landmarks
}

export type Frame = {
  t: number // milliseconds since recording started
  hands: HandFrame[] // empty when no hands were seen
}

export type SignExample = {
  sign: string
  recordedAt: string
  frames: Frame[]
}
