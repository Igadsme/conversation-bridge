Sora

**A two-way conversation aid for Deaf and hearing people.**

Relay is a web app that helps a Deaf signer and a hearing person communicate in a focused setting, such as ordering at a café. It combines limited, camera-based sign recognition with signer-approved text-to-speech, and live captions for spoken replies.

> **Prototype scope:** Relay is not a general-purpose ASL translator, and it is not a replacement for human interpreters. Sign language recognition is a difficult, context-dependent problem. This prototype demonstrates a small, explicitly supported vocabulary, and the signer reviews every proposed message before it is spoken. It is not meant for medical, legal or emergency use.

Built for Hacklanta '26 (Social Good track). Repo: [demi43/conversation-bridge](https://github.com/demi43/conversation-bridge) (working name: Conversation Bridge).

## How it works

### Sign → text → speech

1. The signer uses the camera to perform a supported sign or phrase.
2. On-device landmark tracking (MediaPipe) follows the signer's hands, face and body.
3. A sign recognition model, trained on Deaf signers by the winners of a Kaggle competition, proposes the top 3 signs with confidence scores.
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
- Privacy-first design: camera processing and sign recognition run locally in the browser; no video is stored
- Responsive web experience for a laptop or tablet on the counter

## Progress

| Step | What | Status |
| --- | --- | --- |
| 1 | Vite + React + TypeScript project, GitHub repo | Done |
| 2 | Webcam feed with a mirrored canvas overlay | Done |
| 3 | Hand tracking with MediaPipe HandLandmarker (2 hands) | Done |
| 4 | Sign recorder: capture landmark examples per sign, download as JSON | Built |
| 5 | Sign recognition: reuse the 1st-place Kaggle model, show top 3 guesses | In progress |
| 6 | Sentence builder, then Gemini turns the signs into a literal English sentence | Built (needs Gemini key) |
| 7 | Confirm screen (built) + ElevenLabs text-to-speech with voice picker | In progress |
| 8 | ElevenLabs realtime speech-to-text captions | Planned |
| 9 | Fingerspelling fallback and repair (start over, wait) | Planned |

**Step 5 in detail:**

- [x] Kaggle data access set up; sign list and `train.csv` downloaded
- [x] Checked our vocabulary against the model's 250 signs (9 of 20 covered, see [Vocabulary](#vocabulary))
- [x] Downloaded the trained 1st-place model (`model.tflite`, 11 MB)
- [x] Wrote [`scripts/check_model.py`](scripts/check_model.py) to test the model on real examples
- [x] Ran the Python check: 17/18 top-1 and 18/18 top-3 on our 9 covered signs (format confirmed; examples may overlap the training data, so live testing is the real accuracy check)
- [x] Switched browser tracking from HandLandmarker to HolisticLandmarker (543 points per frame, [`src/landmarks.ts`](src/landmarks.ts))
- [x] Run the model in the browser with LiteRT.js ([`src/signmodel.ts`](src/signmodel.ts)); scores match Python exactly
- [x] Cut live signing into clips ([`src/segmenter.ts`](src/segmenter.ts)) and show the top 3 guesses ([`src/recognizer.tsx`](src/recognizer.tsx))
- [x] "Compare with" switch: top 3 from all 250 signs (default) or only our vocabulary
- [x] ASL Citizen added in the browser: model files, `onnxruntime-web`, name mapping, [`src/aslcitizenmodel.ts`](src/aslcitizenmodel.ts) (matches Python on test clips)
- [x] Model switch on the Recognize page: Both (default), Kaggle or ASL Citizen; tested end to end with ASL Citizen test videos as a fake webcam
- [x] Sentence builder: recognized signs collect as chips you can swap, remove or add to, then Done ([`src/sentencebuilder.tsx`](src/sentencebuilder.tsx))
- [ ] Test live on our own signing; tune thresholds; confirm mirroring

A detailed log of each step, with the commands used, is in [`steps.txt`](steps.txt).

## Getting started

Requires Node.js 20.19 or newer and a webcam.

```bash
git clone https://github.com/demi43/conversation-bridge.git
cd conversation-bridge
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173) and allow camera access.

`npm run dev` starts both the HTTPS Vite frontend and the API backend. Vite
proxies `/api` requests to the backend at `http://127.0.0.1:3001`.

The hand-tracking model lives in `public/models/hand_landmarker.task`. If it's missing, download it:

```bash
mkdir -p public/models
curl -L -o public/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
```

### Recording your own signing (personal calibration)

The **Record** mode records the demo signer's own examples, used to train a small personal model on top of ASL Citizen so recognition is more accurate for that signer.

1. Pick a sign from the dropdown and press **Space** (or **Start**).
2. Sign it, then lower your hands out of view. Repeat. Each sign is saved automatically, up to 15.
3. Also record **NOT-A-SIGN**: everyday movements like scratching your head or waving, so the model learns when to say "not sure".
4. Click **Download** after each sign and save the file into `data/personal/`.

**Your own words and phrases:** type one into **Add your own word or phrase**, for example `hello how are you`, and it becomes a label (`HELLO-HOW-ARE-YOU`) in the dropdown, remembered in this browser. Sign a phrase in one go, without lowering your hands in the middle, so each one is saved as a single clip. After training, the personal model recognizes it as one unit, and Gemini translates it as the phrase ("Hello, how are you?").

Clips are cut exactly the way the Recognize page cuts them, so the training data matches what the app sees live. Record in demo conditions (same laptop, camera height, distance and lighting), and have an ASL-fluent person check your signs first.

Only body and hand points are saved, never video. `data/personal/` is git-ignored because it's personal data. Get permission before recording anyone else.

**Training:** `python scripts/train_personal.py` (in the `asl-ml` env) reads every file in `data/personal/`, runs each clip through ASL Citizen to get its 256-number description, and trains a small classifier on those for your signs. On a first batch of 8 signs (15 clips each), clips held back from training were recognized 100% of the time, against 73% for ASL Citizen alone among the same 8 signs. With 12 labels (11 signs plus the phrase HELLO-HOW-ARE-YOU, 181 clips) it was 99%, against 65% for ASL Citizen. Those test clips come from the same recording sessions, so record in demo conditions. The result is saved to `data/personal/personal_model.json`.

**In the app:** run `sh scripts/setup_model.sh` to copy the trained model into `public/models/` (git-ignored), then pick **Personal** or **Combined** on the Recognize page. Personal reuses ASL Citizen's description of each clip, so it adds no noticeable time. In **Combined**, the personal answer is shown when it's at least 70% sure; otherwise the app falls back to Kaggle and ASL Citizen, so signs you haven't recorded still work. Until **NOT-A-SIGN** is recorded, the personal model always picks one of the recorded signs, which is why it needs to be that sure.

After recording more signs: `python scripts/train_personal.py`, then `sh scripts/setup_model.sh`, then refresh the page.

## Sign recognition model

We reuse the model that won the [Google – Isolated Sign Language Recognition](https://www.kaggle.com/competitions/asl-signs) Kaggle competition (1st of 1,165 teams), instead of training our own.

| | |
| --- | --- |
| Author | Hoyeol Sohn ([hoyso48](https://www.kaggle.com/hoyso48)) |
| Trained model | Output of the Kaggle notebook [`hoyso48/1st-place-solution-inference`](https://www.kaggle.com/code/hoyso48/1st-place-solution-inference) |
| Training code | [`hoyso48/1st-place-solution-training`](https://www.kaggle.com/code/hoyso48/1st-place-solution-training), also in [`data-training/`](data-training/) and on [GitHub](https://github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution) (MIT license) |
| Format | TensorFlow Lite, 11 MB |
| Input | `inputs`: float32 `[frames, 543, 3]`, x/y/z per landmark, NaN where a part isn't detected |
| Output | `outputs`: float32 `[250]`, one score per sign |
| Signs | 250, listed in `sign_to_prediction_index_map.json` |
| Training data | 94,477 examples from 21 Deaf signers ([PopSign ASL](https://proceedings.neurips.cc/paper_files/paper/2023/hash/00dada608b8db212ea7d9d92b24c68de-Abstract.html)) |

The 543 landmarks come from MediaPipe Holistic, in this fixed order:

| Part | Landmark indexes |
| --- | --- |
| Face | 0–467 |
| Left hand | 468–488 |
| Pose (body) | 489–521 |
| Right hand | 522–542 |

**Things to get right when we move it to the browser:**

- The live input must match the training input exactly. The newer MediaPipe face model returns 478 points (468 + 10 iris), so the iris points have to be dropped.
- Mirroring must match the training data. We'll test both ways with known signs.
- We only show scores for signs in our vocabulary, re-normalized, top 3. Below a confidence threshold, the app says it's not sure and offers fingerspelling.

## Second model: ASL Citizen

To cover the coffee words the Kaggle model doesn't know, we add Microsoft's [ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/) pose model (ST-GCN, [code and weights](https://github.com/microsoft/ASL-citizen-code), MIT-licensed code).

| | |
| --- | --- |
| Signs | 2,731, recorded on home webcams by Deaf and hard-of-hearing signers |
| Our vocabulary | 17 of 20 directly; LARGE → BIG, MEDIUM → MIDDLE or REGULAR, SUGAR → SWEET |
| Format | ONNX (converted from PyTorch by [`scripts/convert_asl_citizen.py`](scripts/convert_asl_citizen.py)), 15.2 MB |
| Input | `[1, 2, 128, 27]`: x/y of 27 MediaPipe Holistic points over 128 frames |
| Tested on | 40 of Microsoft's test-set videos ([`scripts/check_asl_citizen.py`](scripts/check_asl_citizen.py)) |
| Accuracy | All 2,731 signs: 20/40 top-1, 33/40 top-5. **Our 20 signs: 38/40 top-1 (95%)** |

**License:** the ASL Citizen data is under the Microsoft Research License (non-commercial research only, no redistribution, no hosted service for others). A local demo is fine. All ASL Citizen files stay in the git-ignored `asl-citizen/` folder, and we ask Microsoft (ASL_Citizen@microsoft.com) before hosting publicly.

**Setup** (in the `asl-ml` env, from the project root):

```bash
pip install torch onnx onnxruntime mediapipe opencv-python-headless remotezip
mkdir -p asl-citizen
curl -L -o asl-citizen/stgcn_weights.zip https://github.com/microsoft/ASL-citizen-code/releases/download/checkpoints_v1/ASL_citizen_stgcn_weights.zip
unzip -o asl-citizen/stgcn_weights.zip -d asl-citizen/weights
git clone --depth 1 https://github.com/microsoft/ASL-citizen-code asl-citizen/code
```

Then pull the sign lists out of the dataset zip without downloading all 42.8 GB (see `steps.txt`, A2), and run `python scripts/convert_asl_citizen.py` and `python scripts/check_asl_citizen.py`.

**In the browser:** `sh scripts/setup_model.sh` copies `asl_citizen.onnx` and its sign list into `public/models/`, and [`src/aslcitizenmodel.ts`](src/aslcitizenmodel.ts) runs it with ONNX Runtime Web. Its preprocessing is a line-by-line port of Microsoft's code and gives the same top 3 as Python on their test clips, at about 150 ms per sign.

**How the two models work together:** on the Recognize page, **Both** runs each sign through both models. The main answer comes from Kaggle when its top guess is one of our signs it knows (it's more accurate on those, e.g. HELLO), and from ASL Citizen otherwise (e.g. COFFEE, LARGE). Their percentages aren't compared directly, because one model chooses from 250 signs and the other from 2,731.

ASL Citizen also gets each clip with about 0.67 seconds of resting frames before and after the sign, because it was trained on whole recordings. On 40 test videos this raised its accuracy on our signs from 32/40 to 38/40. In an end-to-end test with Microsoft's test videos as a fake webcam, the app recognized COFFEE, HELLO and LARGE correctly every time.

## Vocabulary

The starter vocabulary (coffee counter) is in [`src/signs.ts`](src/signs.ts). The Kaggle model knows 9 of our 20 signs:

| Covered by the model (examples in training data) | Not covered |
| --- | --- |
| HELLO (390), THANK-YOU (357), PLEASE (384), WATER (384), MILK (377), HOT (383), WAIT (346), YES (386), NO (370) | COFFEE, TEA, SMALL, MEDIUM, LARGE, COLD, MORE, LESS, SUGAR, AGAIN, HELP |

**Open decision:** keep the coffee counter (record or fingerspell the 11 missing signs), or switch to a snack or ice-cream counter that uses only signs the model already knows, for example:

> HELLO, BYE, PLEASE, THANK-YOU, ICECREAM, CHOCOLATE, DRINK, WATER, MILK, SNACK, FOOD, PIZZA, FRENCHFRIES, APPLE, ORANGE, CEREAL, NUTS, GUM, HAVE, LIKE, GIVE, ANOTHER, NAPKIN, HOT, NOT, HUNGRY, THIRSTY, WAIT, YES, NO, SAME, FINISH

## Gemini setup (signs to English)

After you press **Done** on a sentence, the app sends **only the sign words** (for example `COFFEE HOT LARGE PLEASE`) to Gemini and shows the English for you to approve. The API key stays on the dev server and never reaches the browser.

1. Get a key at [aistudio.google.com](https://aistudio.google.com) → **Get API key**.
2. Create a file called `.env` in the project folder (it's git-ignored):
   ```
   GEMINI_API_KEY=your-key-here
   ```
3. Restart `npm run dev`.

The model is `gemini-3.5-flash-lite` by default; set `GEMINI_MODEL=...` in `.env` to try another. The instructions to Gemini ([`server/translate.ts`](server/translate.ts)) keep it literal: no added meaning, alternatives when unsure, and a warning when the signs don't clearly form a sentence. Nothing is spoken until you press **Approve**.

## Backend API

Copy `.env.example` to `.env` and add the service credentials you intend to use:

```bash
cp .env.example .env
```

The standalone TypeScript backend provides:

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Reports which external services are configured, without exposing secrets |
| `POST /api/translate` | Turns a validated list of sign glosses into literal English with Gemini |
| `POST /api/elevenlabs/speech` | Streams MP3 speech for signer-approved text |
| `GET /api/elevenlabs/scribe-token` | Creates a 15-minute, single-use realtime Scribe token |

Example speech request:

```bash
curl -X POST http://127.0.0.1:3001/api/elevenlabs/speech \
  -H 'Content-Type: application/json' \
  -d '{"text":"Can I have a coffee, please?"}' \
  --output speech.mp3
```

The permanent Gemini and ElevenLabs keys stay in the backend. The speech route
accepts at most 2,000 characters, API JSON bodies are size-limited, upstream
requests time out, and service errors are not passed through to the browser.

For a production build:

```bash
npm run build
npm start
```

The production backend serves the compiled frontend and all API routes from one
origin. `npm test` runs backend route tests with mocked external services, so it
does not consume Gemini or ElevenLabs credits.

## Machine learning setup (for the model work)

The model work runs in Python 3.11, separate from the web app. Python 3.14 is too new for TensorFlow and LiteRT.

**1. Kaggle access** (each teammate uses their own account)

1. Create a Kaggle account and verify your phone number.
2. Create an API token at kaggle.com → Settings → API, and set it up:
   ```bash
   echo 'export KAGGLE_API_TOKEN=your-token' >> ~/.zshrc && source ~/.zshrc
   ```
   Or put a legacy key in `~/.kaggle/kaggle.json` and run `chmod 600 ~/.kaggle/kaggle.json`.
3. Accept the competition rules at [kaggle.com/competitions/asl-signs/rules](https://www.kaggle.com/competitions/asl-signs/rules). Until you do, downloads fail with **403 Forbidden** and `kaggle competitions list -s "isolated sign"` shows `userHasEntered: False`.

**2. Download the data and model** (into `kaggle/`, which is git-ignored)

```bash
kaggle competitions download -c asl-signs -f sign_to_prediction_index_map.json -p kaggle
kaggle competitions download -c asl-signs -f train.csv -p kaggle
cd kaggle && unzip -o '*.zip'; cd ..

mkdir -p kaggle/model-1st
kaggle kernels output hoyso48/1st-place-solution-inference -p kaggle/model-1st
```

`kaggle kernels output` downloads the files a notebook produced, which is where `model.tflite` comes from. `kaggle kernels pull` downloads only its code.

**3. Python environment and model check**

```bash
conda create -n asl-ml python=3.11 -y
conda activate asl-ml
pip install ai-edge-litert pandas pyarrow numpy kaggle   # or: pip install tensorflow

python scripts/check_model.py
```

**4. Put the model where the app can load it**

```bash
sh scripts/setup_model.sh
```

This copies the Kaggle model and sign list (`sign_model.tflite`, `sign_labels.json`) and, if you've set up ASL Citizen, its model and sign list (`asl_citizen.onnx`, `asl_citizen_labels.json`) into `public/models/`. All four are git-ignored. Without them, the Recognize page says the sign model is missing.

The check prints the model's inputs and outputs, downloads 2 real examples of each covered sign, and shows the model's top 3 guesses for each.

## Project structure

```
public/models/holistic_landmarker.task  MediaPipe face + body + hands model (step 6)
public/models/hand_landmarker.task   MediaPipe hand-only model (steps 3-5, no longer used)
src/App.tsx                          App entry page
src/cameraview.tsx / .css            Webcam + holistic tracking overlay (steps 2-6)
src/landmarks.ts                     Converts tracking into the model's 543-point frame (step 6)
src/recorder.tsx / .css              Records the signer's own examples (personal calibration)
src/signmodel.ts                     Runs the Kaggle model in the browser (step 7)
src/aslcitizenmodel.ts               Runs the ASL Citizen model in the browser (Phase B)
src/personalmodel.ts                 Runs the personal calibration classifier
scripts/train_personal.py            Trains the personal classifier on data/personal/
src/segmenter.ts                     Cuts live video into one clip per sign (step 8)
src/recognizer.tsx / .css            Live recognition page, top 3 guesses (step 8)
src/sentencebuilder.tsx / .css       Builds a sentence from recognized signs before translation
src/translationpanel.tsx             Shows Gemini's English options; the signer approves one
src/translate.ts                     Browser side of /api/translate
server/translate.ts                  Calls Gemini on the dev server (keeps the key secret)
src/signs.ts                         Vocabulary and recording data types
scripts/check_model.py               Tests the Kaggle model on real examples (step 5)
scripts/setup_model.sh               Copies the model into public/models/ (step 7)
data-training/                       1st-place training notebook, for reference
data/personal/                       Personal calibration recordings (git-ignored)
kaggle/                              Kaggle data and model (git-ignored, download it yourself)
asl-citizen/                         ASL Citizen weights, code, sign list, ONNX model (git-ignored)
scripts/convert_asl_citizen.py       Converts ASL Citizen to ONNX
scripts/check_asl_citizen.py         Tests ASL Citizen on its test-set videos
steps.txt                            Step-by-step build log
```

## Data, privacy and licensing

- **No video is stored.** Tracking runs in the browser, and only landmark points are kept.
- **Kaggle data is not committed.** The `kaggle/` folder is git-ignored: the repo is public, the competition rules limit sharing the data, and the landmark files get large. Each teammate downloads it with their own account.
- **Secrets stay out of git.** All `.env` files except `.env.example` are ignored, and the Kaggle token lives in your home folder, not the project.
- **Before the model goes into `public/`** (where it would be publicly served), we confirm the inference notebook's license on its Kaggle page.

## Technology

- **Frontend:** Vite, React, TypeScript
- **Camera / microphone:** Browser MediaDevices APIs
- **Landmark tracking:** MediaPipe Tasks Vision (web), HolisticLandmarker (face, body, hands)
- **Sign recognition:** 1st-place Kaggle model (TensorFlow Lite), run in the browser with [LiteRT.js](https://developers.google.com/edge/litert/web) (`@litertjs/core` 2.5.3, WASM)
- **Second sign model:** ASL Citizen (ONNX), run in the browser with [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) (`onnxruntime-web` 1.30.0, WASM)
- **Model testing:** Python 3.11, ai-edge-litert, pandas, PyTorch, ONNX Runtime, MediaPipe
- **Signs → English:** Gemini API (`@google/genai`, `gemini-3.5-flash-lite`), called from the dev server
- **Speech-to-text:** ElevenLabs Realtime Speech-to-Text API (planned)
- **Text-to-speech:** ElevenLabs Text-to-Speech API (planned)
- **Backend:** standalone Node.js API server for Gemini translation, streamed ElevenLabs speech and temporary speech-to-text tokens

MediaPipe provides tracking building blocks; it does not provide ASL translation. Recognition comes from the separate Kaggle model.

## Credits

- **Sign recognition model and training code:** Hoyeol Sohn (hoyso48), 1st place in Google – Isolated Sign Language Recognition. Code under the MIT license.
- **Second model and data:** ASL Citizen by Microsoft Research (Desai et al., 2023), Microsoft Research License.
- **Training data:** PopSign ASL v1.0, collected by Georgia Tech, Deaf Professional Arts Network (D-PAN) and Google from Deaf adult signers.
- **Landmark tracking:** Google MediaPipe.
