// SENTENCE B - Browser side of the translation: ask our dev server, which asks
// Gemini (see server/translate.ts). The browser never sees the API key.

export type Translation = {
  sentence: string
  alternatives: string[]
  unclear: boolean
}

const translationCache = new Map<string, Translation>()
const translationRequests = new Map<string, Promise<Translation>>()

export async function translate(signs: string[], question: boolean, signal?: AbortSignal): Promise<Translation> {
  const key = JSON.stringify({ signs, question })
  const cached = translationCache.get(key)
  if (cached) return cached

  const existing = translationRequests.get(key)
  if (existing) return existing

  const request = fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signs, question }),
    ...(signal ? { signal } : {}),
  })
    .then(async (response) => {
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? `Translation failed (${response.status})`)
      const result = body as Translation
      translationCache.set(key, result)
      return result
    })
    .finally(() => translationRequests.delete(key))

  translationRequests.set(key, request)
  return request
}
