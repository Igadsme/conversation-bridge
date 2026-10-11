export type ServiceHealth = {
  ok: boolean
  services: { gemini: boolean; elevenlabs: boolean }
}

async function errorMessage(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown }
  return typeof body.error === 'string' ? body.error : `Request failed (${response.status})`
}

export async function getServiceHealth(): Promise<ServiceHealth> {
  const response = await fetch('/api/health')
  if (!response.ok) throw new Error(await errorMessage(response))
  return (await response.json()) as ServiceHealth
}

export async function getScribeToken(): Promise<string> {
  const response = await fetch('/api/elevenlabs/scribe-token')
  if (!response.ok) throw new Error(await errorMessage(response))
  const body = (await response.json()) as { token?: unknown }
  if (typeof body.token !== 'string') throw new Error('The server returned an invalid caption token')
  return body.token
}

export type SpeechPlayback = {
  audio: HTMLAudioElement
  finished: Promise<void>
  stop: () => void
}

export async function startSpeech(text: string): Promise<SpeechPlayback> {
  const response = await fetch('/api/elevenlabs/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))

  const url = URL.createObjectURL(await response.blob())
  const audio = new Audio(url)
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
  audio.addEventListener('ended', () => {
    cleanup()
    resolveFinished()
  }, { once: true })
  audio.addEventListener('error', () => {
    cleanup()
    rejectFinished(new Error('The generated audio could not be played'))
  }, { once: true })

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
