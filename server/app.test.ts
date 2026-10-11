import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { afterEach, test } from 'node:test'
import { createApiHandler, type BackendConfig } from './app.js'

const servers: import('node:http').Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

async function start(
  config: BackendConfig = {},
  overrides: Parameters<typeof createApiHandler>[1] = {},
) {
  const handler = createApiHandler(config, overrides)
  const server = createServer(async (request, response) => {
    if (!(await handler(request, response))) {
      response.statusCode = 404
      response.end()
    }
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

test('health reports service configuration without exposing secrets', async () => {
  const base = await start({ geminiApiKey: 'gem-secret', elevenLabsApiKey: 'eleven-secret', elevenLabsVoiceId: 'voice_123' })
  const response = await fetch(`${base}/api/health`)
  assert.equal(response.status, 200)
  const text = await response.text()
  assert.deepEqual(JSON.parse(text), { ok: true, services: { gemini: true, elevenlabs: true } })
  assert(!text.includes('secret'))
})

test('translation validates and passes a safe request to the translator', async () => {
  let receivedKey = ''
  const base = await start(
    { geminiApiKey: 'gem-secret', geminiModel: 'test-model' },
    {
      translate: async (key, request, model) => {
        receivedKey = key
        assert.deepEqual(request, { signs: ['COFFEE', 'PLEASE'], question: false })
        assert.equal(model, 'test-model')
        return { sentence: 'Coffee, please.', alternatives: [], unclear: false }
      },
    },
  )
  const response = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signs: ['COFFEE', 'PLEASE'], question: false }),
  })
  assert.equal(response.status, 200)
  assert.equal(receivedKey, 'gem-secret')
  assert.equal(((await response.json()) as { sentence: string }).sentence, 'Coffee, please.')
})

test('translation rejects invalid sign labels', async () => {
  const base = await start({ geminiApiKey: 'gem-secret' })
  const response = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signs: ['not valid'], question: false }),
  })
  assert.equal(response.status, 400)
  assert.match(((await response.json()) as { error: string }).error, /Not a sign name/)
})

test('missing service configuration returns 503', async () => {
  const base = await start()
  const response = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signs: ['HELLO'], question: false }),
  })
  assert.equal(response.status, 503)
  assert.match(((await response.json()) as { error: string }).error, /Gemini is not configured/)
})

test('replies endpoint validates context and calls Gemini', async () => {
  let receivedKey = ''
  const base = await start(
    { geminiApiKey: 'gem-secret', geminiModel: 'test-model' },
    {
      suggest: async (key, request, model) => {
        receivedKey = key
        assert.deepEqual(request, { context: 'Coffee, please.' })
        assert.equal(model, 'test-model')
        return { replies: ['Yes, please.', 'No, thank you.', 'Could you repeat that?'] }
      },
    },
  )
  const response = await fetch(`${base}/api/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: 'Coffee, please.' }),
  })
  assert.equal(response.status, 200)
  assert.equal(receivedKey, 'gem-secret')
  const body = (await response.json()) as { replies: string[] }
  assert.equal(body.replies.length, 3)
})

test('replies endpoint rejects empty context', async () => {
  const base = await start({ geminiApiKey: 'gem-secret' })
  const response = await fetch(`${base}/api/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: '   ' }),
  })
  assert.equal(response.status, 400)
  assert.match(((await response.json()) as { error: string }).error, /context/)
})

test('replies endpoint returns 503 without a Gemini key', async () => {
  const base = await start()
  const response = await fetch(`${base}/api/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: 'Hello' }),
  })
  assert.equal(response.status, 503)
  assert.match(((await response.json()) as { error: string }).error, /Gemini is not configured/)
})

test('speech endpoint streams audio and keeps the API key upstream', async () => {
  let upstreamKey = ''
  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    upstreamKey = new Headers(init?.headers).get('xi-api-key') ?? ''
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } })
  }) as typeof fetch
  const base = await start(
    { elevenLabsApiKey: 'eleven-secret', elevenLabsVoiceId: 'voice_123' },
    { fetch: mockFetch },
  )
  const response = await fetch(`${base}/api/elevenlabs/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello.' }),
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'audio/mpeg')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]))
  assert.equal(upstreamKey, 'eleven-secret')
})

test('scribe endpoint returns only the temporary token', async () => {
  const mockFetch = (async () => Response.json({ token: 'sutkn_test' })) as typeof fetch
  const base = await start({ elevenLabsApiKey: 'eleven-secret' }, { fetch: mockFetch })
  const response = await fetch(`${base}/api/elevenlabs/scribe-token`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { token: 'sutkn_test' })
})

test('unknown API routes and invalid methods return JSON errors', async () => {
  const base = await start()
  const missing = await fetch(`${base}/api/missing`)
  assert.equal(missing.status, 404)
  const method = await fetch(`${base}/api/health`, { method: 'POST' })
  assert.equal(method.status, 405)
})
