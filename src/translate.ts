// SENTENCE B - Browser side of the translation: ask our dev server, which asks
// Gemini (see server/translate.ts). The browser never sees the API key.

export type Translation = {
  sentence: string
  alternatives: string[]
  unclear: boolean
}

export async function translate(signs: string[], question: boolean): Promise<Translation> {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signs, question }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `Translation failed (${response.status})`)
  return body as Translation
}
