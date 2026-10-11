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

// CUSTOM SIGNS - turn what the signer types into a label the whole app accepts:
// "hello how are you" -> "HELLO-HOW-ARE-YOU". Must start with a letter, use only
// A-Z, 0-9 and dashes, max 30 characters (server/translate.ts checks the same rule).
// Returns null if nothing usable is left.
export function toSignName(text: string): string | null {
  const name = text.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return /^[A-Z][A-Z0-9-]{0,29}$/.test(name) ? name : null
}

// PERSONAL CALIBRATION - extra label for clips that aren't any sign (scratching
// your head, waving...), so the personal model learns to say "not sure"
export const NOT_A_SIGN = 'NOT-A-SIGN'

// One recorded clip of the signer, cut by the same Segmenter as the Recognize page
// (so training data matches what the app sees live), resting frames included.
// Each frame keeps x/y of the body and hands only - what ASL Citizen uses -
// to keep files small: 150 numbers per frame, in this order:
//   pose 0-32 | left hand 33-53 | right hand 54-74   (x, y for each; null = not seen)
export type PersonalClip = {
  sign: string // one of VOCABULARY, or NOT_A_SIGN
  recordedAt: string
  start: number // frame where the sign itself starts (frames before are resting)
  end: number // frame where the sign itself ends (exclusive)
  frames: (number | null)[][]
}

// Where each part of a recorded frame sits in the app's 543-point frame (see landmarks.ts)
export const COMPACT_PARTS = [
  { start: 489, count: 33 }, // pose
  { start: 468, count: 21 }, // left hand
  { start: 522, count: 21 }, // right hand
]

// One clip's identity: the same sign recorded at the same time is the same clip
export const clipKey = (clip: PersonalClip) => `${clip.sign}|${clip.recordedAt}`

// Checks a clip read from a downloaded file before it's stored or trained on
export function isPersonalClip(value: unknown): value is PersonalClip {
  const c = value as PersonalClip
  return (
    typeof c === 'object' && c !== null &&
    typeof c.sign === 'string' && toSignName(c.sign) === c.sign &&
    typeof c.recordedAt === 'string' &&
    Array.isArray(c.frames) && c.frames.length > 0 &&
    c.frames.every((f) => Array.isArray(f) && f.length === 150)
  )
}
