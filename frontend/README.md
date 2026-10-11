# Sora frontend

The Sora conversation UI (TanStack Start + React + Tailwind),
connected to the Sora backend in the repository root
(`conversation-bridge/server/`).

Three modes:

| Route | What it does |
| --- | --- |
| `/` | Home, with backend service status |
| `/sign` | **Sign to Speech** — real camera + on-device sign recognition (MediaPipe Holistic, Kaggle TFLite model, ASL Citizen ONNX, personal calibration), sentence builder, Gemini translation, signer approval, then ElevenLabs speech |
| `/captions` | **Speech to Text** — live ElevenLabs Scribe captions of the hearing person, in three sizes |
| `/conversation` | **Conversation Mode** — both directions in one chat |
| `/record` | Personal training: record your own signs to calibrate the recognizer |

## How the frontend talks to the backend

All API calls go to `/api/*` on the same origin. In development a
server middleware (`src/start.ts`) proxies them to the backend at
`http://127.0.0.1:3001`, so the permanent Gemini and ElevenLabs
keys stay on the backend and never reach the browser:

| Route | Backend route |
| --- | --- |
| Service badges on home | `GET /api/health` |
| Sign → English | `POST /api/translate` |
| Approved text → speech | `POST /api/elevenlabs/speech` |
| Live captions | `GET /api/elevenlabs/scribe-token` → ElevenLabs realtime Scribe WebSocket |

## Running it

Requires Node.js **20.19+** (Vite 8) and the backend running.

```bash
# 1. Backend (repo root) — also serves the API on 127.0.0.1:3001
cd ..
npm install
cp .env.example .env   # add GEMINI_API_KEY and ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID
npm run dev:server

# 2. Frontend (this folder)
npm install            # npm 10: use --legacy-peer-deps if install errors
npm run dev            # http://localhost:8080
```

Open http://localhost:8080 and allow camera (and microphone for
captions). Camera and microphone only work on `localhost` or HTTPS.

Other commands: `npm run build` (production build), `npm run typecheck`,
`npm test`.

To point a built app at a deployed backend, set `SORA_API_UPSTREAM`
(e.g. `SORA_API_UPSTREAM=https://sora-backend.example.com`) before
building; without it, the proxy is dev-only.

## Models

The on-device models in `public/models/` are git-ignored (size and
licenses). Copy them from the root repo, or run the root repo's
`sh scripts/setup_model.sh`:

- `holistic_landmarker.task` — MediaPipe face + body + hands tracking
- `sign_model.tflite` + `sign_labels.json` — Kaggle 1st-place model (250 signs)
- `asl_citizen.onnx` + `asl_citizen_labels.json` — Microsoft ASL Citizen (2,731 signs)
- `personal_model.json` — your personal calibration classifier

Without `sign_model.tflite`, the Recognizer still works with ASL
Citizen and the personal model (pick them in the Model switch).

## Notes

- Sign recognition is limited and developing. The signer reviews every
  message before it is spoken. Not a substitute for a qualified
  interpreter — do not rely on it for medical, legal, or emergency
  communication.
- This folder was created from a Lovable export and is connected to
  Lovable (see AGENTS.md). Keep the branch in a working state; avoid
  rewriting pushed history.
- `tsconfig.json` deliberately keeps `noUncheckedIndexedAccess` and
  `noPropertyAccessFromIndexSignature` off: the recognition pipeline
  was ported from the root repo, where it is written and tested
  without those flags.
