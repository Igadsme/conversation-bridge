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
// ASL CITIZEN B3 - Our sign -> its name(s) in the ASL Citizen model.
// Some signs have numbered variants (MILK1, MILK2); any of them counts as our sign.
// LARGE, MEDIUM and SUGAR use the closest ASL Citizen sign.
export const ASL_CITIZEN_NAMES: Record<string, string[]> = {
  HELLO: ['HELLO'],
  'THANK-YOU': ['THANKYOU'],
  PLEASE: ['PLEASE'],
  COFFEE: ['COFFEE'],
  TEA: ['TEA'],
  WATER: ['WATER'],
  MILK: ['MILK1', 'MILK2'],
  SMALL: ['SMALL'],
  MEDIUM: ['MIDDLE', 'REGULAR'], // TODO: pick one once we've tested both
  LARGE: ['BIG'],
  HOT: ['HOT'],
  COLD: ['COLD'],
  MORE: ['MORE'],
  LESS: ['LESS'],
  SUGAR: ['SWEET'], // same sign as SUGAR in ASL - confirm with an ASL-fluent signer
  WAIT: ['WAIT'],
  AGAIN: ['AGAIN'],
  YES: ['YES'],
  NO: ['NO'],
  HELP: ['HELP'],
}


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
