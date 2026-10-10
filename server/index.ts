import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
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
const production = process.env.NODE_ENV === 'production'
const dist = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

function serveStatic(pathname: string, response: import('node:http').ServerResponse) {
  const requested = resolve(dist, `.${pathname}`)
  const insideDist = requested === dist || requested.startsWith(`${dist}${sep}`)
  let file = insideDist && existsSync(requested) && statSync(requested).isFile() ? requested : resolve(dist, 'index.html')
  if (!file.startsWith(`${dist}${sep}`) || !existsSync(file)) {
    response.statusCode = 404
    response.end('Not found')
    return
  }
  response.statusCode = 200
  response.setHeader('Content-Type', contentTypes[extname(file)] || 'application/octet-stream')
  if (file.includes(`${sep}assets${sep}`)) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  else response.setHeader('Cache-Control', 'no-cache')
  createReadStream(file).pipe(response)
}

const server = createServer(async (request, response) => {
  if (await api(request, response)) return
  if (production && (request.method === 'GET' || request.method === 'HEAD')) {
    serveStatic(new URL(request.url ?? '/', 'http://localhost').pathname, response)
    return
  }
  response.statusCode = 404
  response.end('Not found')
})

server.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}${production ? ' (serving dist)' : ''}`)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
