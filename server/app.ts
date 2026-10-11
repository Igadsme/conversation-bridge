import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { DEFAULT_MODEL, parseRepliesRequest, parseRequest, suggestReplies, translateSigns, type Replies, type RepliesRequest, type TranslateRequest, type Translation } from './translate.js'

const JSON_LIMIT = 16 * 1024
const SPEECH_TEXT_LIMIT = 2_000
const UPSTREAM_TIMEOUT_MS = 30_000
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'

export type BackendConfig = {
  geminiApiKey?: string
  geminiModel?: string
  elevenLabsApiKey?: string
  elevenLabsVoiceId?: string
  elevenLabsModel?: string
}

type Dependencies = {
  fetch: typeof globalThis.fetch
  translate: (apiKey: string, request: TranslateRequest, model: string) => Promise<Translation>
  suggest: (apiKey: string, request: RepliesRequest, model: string) => Promise<Replies>
}

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const contentType = req.headers['content-type']?.split(';', 1)[0]
  if (contentType !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json')

  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (Buffer.byteLength(body) > JSON_LIMIT) throw new HttpError(413, 'Request body is too large')
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON')
  }
}

function requireMethod(req: IncomingMessage, method: string) {
  if (req.method === method) return
  throw new HttpError(405, `Use ${method}`)
}

function requireSecret(value: string | undefined, name: string) {
  if (!value) throw new HttpError(503, `${name} is not configured on the server`)
  return value
}

function parseSpeechRequest(body: unknown, defaultVoiceId?: string) {
  const input = body as { text?: unknown; voiceId?: unknown } | null
  if (typeof input?.text !== 'string' || !input.text.trim()) throw new HttpError(400, 'Text is required')
  const text = input.text.trim()
  if (text.length > SPEECH_TEXT_LIMIT) throw new HttpError(400, `Text must be ${SPEECH_TEXT_LIMIT} characters or fewer`)

  const voiceId = input.voiceId ?? defaultVoiceId
  if (typeof voiceId !== 'string' || !/^[A-Za-z0-9_-]{3,100}$/.test(voiceId)) {
    throw new HttpError(503, 'No valid ElevenLabs voice is configured')
  }
  return { text, voiceId }
}

async function upstreamError(response: Response, service: string): Promise<never> {
  // Log a short upstream response for operators, but never expose it to clients.
  const detail = (await response.text()).slice(0, 1_000)
  console.error(`${service} returned ${response.status}: ${detail}`)
  throw new HttpError(502, `${service} request failed`)
}

export function createApiHandler(config: BackendConfig, overrides: Partial<Dependencies> = {}): ApiHandler {
  const dependencies: Dependencies = {
    fetch: globalThis.fetch,
    translate: translateSigns,
    suggest: suggestReplies,
    ...overrides,
  }

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return false

    const requestId = randomUUID()
    res.setHeader('X-Request-Id', requestId)

    try {
      if (url.pathname === '/api/health') {
        requireMethod(req, 'GET')
        json(res, 200, {
          ok: true,
          services: {
            gemini: Boolean(config.geminiApiKey),
            elevenlabs: Boolean(config.elevenLabsApiKey && config.elevenLabsVoiceId),
          },
        })
        return true
      }

      if (url.pathname === '/api/translate') {
        requireMethod(req, 'POST')
        const apiKey = requireSecret(config.geminiApiKey, 'Gemini')
        let request: TranslateRequest
        try {
          request = parseRequest(await readJson(req))
        } catch (error) {
          if (error instanceof HttpError) throw error
          throw new HttpError(400, error instanceof Error ? error.message : 'Invalid translation request')
        }
        let result: Translation
        try {
          result = await dependencies.translate(apiKey, request, config.geminiModel || DEFAULT_MODEL)
        } catch (error) {
          console.error('Gemini translation failed:', error)
          throw new HttpError(502, 'Gemini translation failed')
        }
        json(res, 200, result)
        return true
      }

      if (url.pathname === '/api/replies') {
        requireMethod(req, 'POST')
        const apiKey = requireSecret(config.geminiApiKey, 'Gemini')
        let request: RepliesRequest
        try {
          request = parseRepliesRequest(await readJson(req))
        } catch (error) {
          if (error instanceof HttpError) throw error
          throw new HttpError(400, error instanceof Error ? error.message : 'Invalid replies request')
        }
        let result: Replies
        try {
          result = await dependencies.suggest(apiKey, request, config.geminiModel || DEFAULT_MODEL)
        } catch (error) {
          console.error('Gemini replies failed:', error)
          const detail = error instanceof Error ? error.message : String(error)
          // Quota and rate limits are the caller's problem to retry, not a 502.
          if (/429|quota|rate/i.test(detail)) throw new HttpError(429, 'Gemini quota exceeded. Try again shortly.')
          throw new HttpError(502, 'Gemini replies failed')
        }
        json(res, 200, result)
        return true
      }

      if (url.pathname === '/api/elevenlabs/speech') {
        requireMethod(req, 'POST')
        const apiKey = requireSecret(config.elevenLabsApiKey, 'ElevenLabs')
        const { text, voiceId } = parseSpeechRequest(await readJson(req), config.elevenLabsVoiceId)
        const endpoint = `${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`
        const response = await dependencies.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
          body: JSON.stringify({ text, model_id: config.elevenLabsModel || 'eleven_multilingual_v2' }),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
        if (!response.ok || !response.body) await upstreamError(response, 'ElevenLabs speech')

        res.statusCode = 200
        res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg')
        res.setHeader('Cache-Control', 'no-store')
        await new Promise<void>((resolve, reject) => {
          const stream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
          stream.on('error', reject)
          res.on('finish', resolve)
          res.on('close', resolve)
          stream.pipe(res)
        })
        return true
      }

      if (url.pathname === '/api/elevenlabs/scribe-token') {
        requireMethod(req, 'GET')
        const apiKey = requireSecret(config.elevenLabsApiKey, 'ElevenLabs')
        const response = await dependencies.fetch(`${ELEVENLABS_API}/single-use-token/realtime_scribe`, {
          method: 'POST',
          headers: { 'xi-api-key': apiKey },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
        if (!response.ok) await upstreamError(response, 'ElevenLabs token')
        const body = (await response.json()) as { token?: unknown }
        if (typeof body.token !== 'string') throw new HttpError(502, 'ElevenLabs returned an invalid token')
        json(res, 200, { token: body.token })
        return true
      }

      json(res, 404, { error: 'API route not found', requestId })
      return true
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof HttpError ? error.message : 'Internal server error'
      if (!(error instanceof HttpError)) console.error(`[${requestId}]`, error)
      if (!res.headersSent) json(res, status, { error: message, requestId })
      else res.destroy()
      return true
    }
  }
}
