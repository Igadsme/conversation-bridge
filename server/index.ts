import { createServer } from 'node:http'
import { createApiHandler, type BackendConfig } from './app.js'
import { loadLocalEnv } from './env.js'

loadLocalEnv()

const config: BackendConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
  elevenLabsModel: process.env.ELEVENLABS_MODEL,
}
const api = createApiHandler(config)
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'

// API only: the web app (frontend/) is built and deployed on its own and
// forwards /api/* here (see frontend/src/start.ts).
const server = createServer(async (request, response) => {
  if (await api(request, response)) return
  response.statusCode = 404
  response.end('Not found')
})

server.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
