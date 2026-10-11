// Real service layer: every call goes to the Sora backend (server/)
// through /api/*. In development the Vite proxy forwards /api to
// http://127.0.0.1:3001 (see vite.config.ts), so the permanent
// Gemini and ElevenLabs keys never reach the browser.

export type ServiceHealth = {
  ok: boolean
  services: { gemini: boolean; elevenlabs: boolean }
}

export type Translation = {
  sentence: string // best literal English sentence
  alternatives: string[] // other literal phrasings or readings
  unclear: boolean // the signs are ambiguous or don't fit together
}

async function errorMessage(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown }
  return typeof body.error === 'string' ? body.error : `Request failed (${response.status})`
}

/** Which external services the backend has keys for. No secrets. */
export async function checkHealth(): Promise<ServiceHealth> {
  const response = await fetch('/api/health')
  if (!response.ok) throw new Error(await errorMessage(response))
  return (await response.json()) as ServiceHealth
}

/** Turn a list of sign glosses (e.g. ["COFFEE", "HOT", "LARGE"]) into
 *  literal English with Gemini. The signer approves the result before
 *  it is spoken. */
export async function translateSigns(
  signs: string[],
  question: boolean,
): Promise<Translation> {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signs, question }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return (await response.json()) as Translation
}

/** A 15-minute, single-use token for ElevenLabs realtime Scribe. */
export async function getScribeToken(): Promise<string> {
  const response = await fetch('/api/elevenlabs/scribe-token')
  if (!response.ok) throw new Error(await errorMessage(response))
  const body = (await response.json()) as { token?: unknown }
  if (typeof body.token !== 'string') throw new Error('The server returned an invalid caption token')
  return body.token
}

export type SpeechPlayback = {
  audio: HTMLAudioElement
  /** Resolves when the message finishes playing (or is stopped). */
  finished: Promise<void>
  /** Stop playback. */
  stop: () => void
}

// Session audio cache: repeating a message replays the audio
// that was already generated instead of calling ElevenLabs
// again. In-memory only - nothing is persisted, and editing
// a message invalidates its entry (see invalidateSpeechCache).
const speechCache = new Map<string, Blob>()

export function normalizeSpeechKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Drop the cached audio for a message, e.g. after it was edited. */
export function invalidateSpeechCache(text: string) {
  speechCache.delete(normalizeSpeechKey(text))
}

async function fetchSpeech(text: string): Promise<Blob> {
  const response = await fetch('/api/elevenlabs/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.blob()
}

/** Speak signer-approved text with ElevenLabs text-to-speech.
 *  The backend streams the MP3; nothing is spoken until this is called.
 *  With `{ cache: true }` the audio blob is kept for the session, so
 *  repeating the same message makes no second request. */
export async function startSpeech(text: string, playbackRate = 1, options?: { cache?: boolean }): Promise<SpeechPlayback> {
  const key = normalizeSpeechKey(text)
  const cached = options?.cache ? speechCache.get(key) : undefined
  const blob = cached ?? (await fetchSpeech(text))
  if (options?.cache && !cached) speechCache.set(key, blob)

  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.playbackRate = playbackRate
  let settled = false
  let resolveFinished: () => void
  let rejectFinished: (error: Error) => void
  const finished = new Promise<void>((resolve, reject) => {
    resolveFinished = resolve
    rejectFinished = reject
  })
  const cleanup = () => {
    if (settled) return
    settled = true
    URL.revokeObjectURL(url)
  }
  audio.addEventListener(
    'ended',
    () => {
      cleanup()
      resolveFinished()
    },
    { once: true },
  )
  audio.addEventListener(
    'error',
    () => {
      cleanup()
      rejectFinished(new Error('The generated audio could not be played'))
    },
    { once: true },
  )

  try {
    await audio.play()
  } catch (error) {
    cleanup()
    throw error
  }

  return {
    audio,
    finished,
    stop: () => {
      audio.pause()
      audio.currentTime = 0
      cleanup()
      resolveFinished()
    },
  }
}
