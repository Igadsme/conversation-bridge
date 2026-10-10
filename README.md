# Relay

**A two-way conversation aid for Deaf and hearing people.**

Relay is a web app that helps a Deaf signer and a hearing person communicate in a focused setting, such as ordering at a café. It combines limited, camera-based sign recognition with signer-approved text-to-speech, and live captions for spoken replies.

> **Prototype scope:** Relay is not a general-purpose ASL translator, and it is not a replacement for human interpreters. Sign language recognition is a difficult, context-dependent problem. This prototype demonstrates a small, explicitly supported vocabulary, and the signer reviews every proposed message before it is spoken. It is not meant for medical, legal or emergency use.

Built for Hacklanta '26 (Social Good track).

## How it works

### Sign → text → speech

1. The signer uses the camera to perform a supported sign or phrase.
2. On-device landmark tracking follows the signer's hands (face and body tracking are planned).
3. A limited recognition model proposes a phrase and confidence level.
4. The signer reviews, edits, accepts, or rejects the proposed words.
5. Only after approval, ElevenLabs text-to-speech speaks the confirmed message.

### Speech → captions

1. The hearing person speaks into the device microphone.
2. Audio is streamed to ElevenLabs realtime speech-to-text.
3. Live captions appear in large, readable text for the Deaf user.

## Features

- Two-way conversation interface
- Camera-based recognition for a limited set of supported signs or phrases
- Signer review and correction before speech playback
- Realtime speech captions
- Text-to-speech voice selection
- Confidence-aware handling: uncertain recognition prompts a correction or phrase selection
- Privacy-first design: camera processing runs locally in the browser; no video is stored
- Responsive web experience for a laptop or tablet on the counter

## Progress

| Step | What | Status |
| --- | --- | --- |
| 1 | Vite + React + TypeScript project, GitHub repo | ✅ Done |
| 2 | Webcam feed with a mirrored canvas overlay | ✅ Done |
| 3 | Hand tracking with MediaPipe HandLandmarker (2 hands) | ✅ Done |
| 4 | Sign recorder: capture landmark examples per sign, download as JSON | ✅ Built |
| 5 | Matcher: compare live signing to examples, show top 3 guesses | ⏳ Next |
| 6 | Gemini: turn recognized signs into a literal English sentence | Planned |
| 7 | Confirm screen + ElevenLabs text-to-speech with voice picker | Planned |
| 8 | ElevenLabs realtime speech-to-text captions | Planned |
| 9 | Fingerspelling fallback, WAIT / AGAIN repair signs | Planned |

A detailed log of each step, with the commands used, is in [`steps.txt`](steps.txt).

## Getting started

Requires Node.js 20 or newer and a webcam.

```bash
git clone https://github.com/demi43/conversation-bridge.git
cd conversation-bridge
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173) and allow camera access.

The hand-tracking model lives in `public/models/hand_landmarker.task`. If it's missing, download it:

```bash
mkdir -p public/models
curl -L -o public/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
```

### Recording sign examples

The app currently opens on the sign recorder:

1. Pick a sign from the dropdown and press **Space**.
2. Hold your hands down during the 3-2-1 countdown, sign once during the 2-second recording, then lower your hands.
3. Record 5 to 10 varied examples per sign (distance, speed, lighting).
4. Click **Download** and save the file into `data/recordings/`.

Only hand landmark points are saved, never video. Get permission before recording anyone else.

## Project structure

```
public/models/hand_landmarker.task   MediaPipe hand model (loaded locally)
src/App.tsx                          App entry page
src/cameraview.tsx / .css            Webcam + hand tracking overlay (steps 2-4)
src/recorder.tsx / .css              Sign example recorder (step 4)
src/signs.ts                         Vocabulary and recording data types
data/recordings/                     Recorded sign examples (JSON)
steps.txt                            Step-by-step build log
```

## Technology

- **Frontend:** Vite, React, TypeScript
- **Camera / microphone:** Browser MediaDevices APIs
- **Landmark tracking:** MediaPipe Tasks Vision (web), HandLandmarker
- **Signs → English:** Gemini API (planned)
- **Speech-to-text:** ElevenLabs Realtime Speech-to-Text API (planned)
- **Text-to-speech:** ElevenLabs Text-to-Speech API (planned)
- **Backend:** a small API service to keep API keys secret and issue temporary speech-to-text tokens (planned)

MediaPipe provides tracking building blocks; it does not provide ASL translation. A separate matcher and a signer-recorded dataset are needed for the supported vocabulary.

## Sign data

The starter vocabulary (coffee counter) is in [`src/signs.ts`](src/signs.ts): greetings, drinks, sizes, temperature, modifiers and conversation-repair signs.

Planned data sources:

- **Our own recordings** from the recorder, ideally by or checked by an ASL-fluent signer.
- **[PopSign ASL / Kaggle "asl-signs"](https://proceedings.neurips.cc/paper_files/paper/2023/hash/00dada608b8db212ea7d9d92b24c68de-Abstract.html):** MediaPipe landmarks for 250 signs from Deaf adult signers, used for any of our signs in its vocabulary (license to be confirmed before use).
