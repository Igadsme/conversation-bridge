// SENTENCE B - Turn a list of signs (ASL gloss) into English with Gemini.
//
// Runs on the backend, never in the browser, so the API key stays secret:
// server/app.ts serves POST /api/translate and calls translateSigns() here.
// Only the sign words are sent to Gemini - no video, no landmarks.
//
// Setup: put your key in .env (git-ignored) as  GEMINI_API_KEY=...
// Optional: GEMINI_MODEL=... to try another model.

import { GoogleGenAI } from '@google/genai'

// Fast, cheap model for short text (checked against Google's model list, Oct 2026)
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

export type TranslateRequest = {
  signs: string[] // e.g. ["COFFEE", "HOT", "LARGE", "PLEASE"]
  question: boolean // the signer marked it as a question (ASL shows this with the face)
}

export type Translation = {
  sentence: string // best literal English sentence
  alternatives: string[] // other literal phrasings or readings
  unclear: boolean // the signs are ambiguous or don't fit together
}

// The rules that keep Gemini literal. The signer approves every sentence before
// it is spoken on their behalf, so we never want it to add meaning.
const INSTRUCTIONS = `You turn a sequence of American Sign Language (ASL) signs, written as
English gloss words, into short natural English. A Deaf signer at a coffee counter will
read your sentence and approve it before it is spoken aloud on their behalf.

Rules:
- Stay literal. Use only the meaning in the signs. Never add details, quantities, names,
  reasons or extra politeness that were not signed. Small grammar words (a, the, I, can,
  is, would like) are fine.
- ASL word order differs from English (e.g. COFFEE HOT LARGE PLEASE). Reorder into natural
  English: "Can I have a large hot coffee, please?"
- The signer is speaking, in the first person.
- If "question" is true, phrase it as a question.
- A sign repeated twice in a row is probably a recognition error or emphasis; don't repeat
  the word unnaturally.
- A gloss joined with dashes may be a whole phrase the signer recorded themselves, e.g.
  HELLO-HOW-ARE-YOU means "Hello, how are you?". Translate it as that phrase.
- If the signs don't form a clear sentence, still give the most literal reading as
  "sentence", put other plausible readings in "alternatives", and set "unclear" to true.
- "alternatives": up to 2 other phrasings or readings, also literal. Different from
  "sentence".`

// The shape Gemini must answer in
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    sentence: { type: 'string' },
    alternatives: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    unclear: { type: 'boolean' },
  },
  required: ['sentence', 'alternatives', 'unclear'],
}

// Reject anything that doesn't look like a short list of sign names
export function parseRequest(body: unknown): TranslateRequest {
  const b = body as Partial<TranslateRequest> | null
  const signs = b?.signs
  if (!Array.isArray(signs) || signs.length === 0 || signs.length > 30) {
    throw new Error('Send 1 to 30 signs')
  }
  for (const s of signs) {
    if (typeof s !== 'string' || !/^[A-Z][A-Z0-9-]{0,29}$/.test(s)) throw new Error(`Not a sign name: ${String(s)}`)
  }
  return { signs, question: b?.question === true }
}

export async function translateSigns(apiKey: string, request: TranslateRequest, model = DEFAULT_MODEL): Promise<Translation> {
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model,
    contents: JSON.stringify(request),
    config: {
      systemInstruction: INSTRUCTIONS,
      temperature: 0.2, // low: we want the same literal answer each time
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  })
  const parsed = JSON.parse(response.text ?? '{}') as Partial<Translation>
  if (typeof parsed.sentence !== 'string' || !parsed.sentence) throw new Error('Gemini gave no sentence')
  return {
    sentence: parsed.sentence,
    alternatives: (parsed.alternatives ?? []).filter((a) => typeof a === 'string' && a && a !== parsed.sentence),
    unclear: parsed.unclear === true,
  }
}

// SMART REPLIES - suggest short conversational replies for the
// face-to-face mode. Same Gemini model and key as translation,
// but only ever called from the explicit "Suggest with AI"
// button - never automatically, never per transcript update.

export type RepliesRequest = {
  context: string // the last few messages of the conversation
}

export type Replies = {
  replies: string[] // up to 3 short suggestions
}

const REPLY_INSTRUCTIONS = `You suggest short replies for a conversation between a
Deaf signer and a hearing person using the Sora accessibility app. The
person taps a suggestion to send it; it is shown on screen and spoken
aloud on their behalf.

Rules:
- Reply to the last message in the context.
- Keep every suggestion under 60 characters.
- Give exactly 3 suggestions, phrased for the person who taps them.
- Stay neutral and polite. No emojis, no questions about the app itself.`

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    replies: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 3 },
  },
  required: ['replies'],
}

// Reject anything that isn't a short conversation context
export function parseRepliesRequest(body: unknown): RepliesRequest {
  const b = body as Partial<RepliesRequest> | null
  const context = b?.context
  if (typeof context !== 'string' || !context.trim()) throw new Error('Send the conversation context')
  if (context.length > 4000) throw new Error('Context is too long')
  return { context: context.trim() }
}

export async function suggestReplies(apiKey: string, request: RepliesRequest, model = DEFAULT_MODEL): Promise<Replies> {
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model,
    contents: JSON.stringify(request),
    config: {
      systemInstruction: REPLY_INSTRUCTIONS,
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseJsonSchema: REPLY_SCHEMA,
    },
  })
  const parsed = JSON.parse(response.text ?? '{}') as Partial<Replies>
  const replies = (parsed.replies ?? [])
    .filter((r) => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim())
    .slice(0, 3)
  if (replies.length === 0) throw new Error('Gemini gave no replies')
  return { replies }
}
