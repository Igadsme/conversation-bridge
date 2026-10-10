import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { DEFAULT_MODEL, parseRequest, translateSigns } from './server/translate.ts'

// SENTENCE B - POST /api/translate on the dev server: { signs, question } -> English.
// The Gemini key is read here from .env and never sent to the browser
// (only variables starting with VITE_ reach browser code).
function translateApi(env: Record<string, string>): Plugin {
  return {
    name: 'translate-api',
    configureServer(server) {
      server.middlewares.use('/api/translate', async (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return reply(405, { error: 'Use POST' })
        if (!env.GEMINI_API_KEY) {
          return reply(503, { error: 'No Gemini key. Add GEMINI_API_KEY=... to .env and restart npm run dev.' })
        }
        let body = ''
        for await (const chunk of req) body += chunk
        let request
        try {
          request = parseRequest(JSON.parse(body))
        } catch (err) {
          return reply(400, { error: err instanceof Error ? err.message : 'Bad request' })
        }
        try {
          reply(200, await translateSigns(env.GEMINI_API_KEY, request, env.GEMINI_MODEL || DEFAULT_MODEL))
        } catch (err) {
          console.error('Gemini translation failed:', err)
          reply(502, { error: 'Translation failed. Check the terminal running npm run dev for details.' })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' = load every variable in .env, not just VITE_ ones (server side only)
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // basicSsl: serve over HTTPS so other devices on the network are allowed to use the camera
    plugins: [react(), basicSsl(), translateApi(env)],
  }
})
