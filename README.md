A two-way conversation aid for Deaf and hearing people.
Relay is a mobile-first web app concept for helping a Deaf signer and a hearing person communicate in a focused setting, such as ordering at a café. It combines limited, camera-based sign recognition with signer-approved text-to-speech, and live captions for spoken replies.
Prototype scope: Relay is not a general-purpose ASL translator. Sign language recognition is a difficult, context-dependent problem. This prototype is intended to demonstrate a small, explicitly supported vocabulary, with the signer reviewing every proposed message before it is spoken.

How it works
Sign → text → speech
1. The signer uses the camera to perform a supported sign or phrase.
2. On-device landmark tracking follows relevant hand, face, and body movement.
3. A limited recognition model proposes a phrase and confidence level.
4. The signer reviews, edits, accepts, or rejects the proposed words.
5. Only after approval, ElevenLabs text-to-speech speaks the confirmed message.
Speech → captions
1. The hearing person speaks into the device microphone.
2. Audio is streamed to ElevenLabs realtime speech-to-text.
3. Live captions appear in large, readable text for the Deaf user.
Features
- Two-way conversation interface
- Camera-based recognition for a limited set of supported signs or phrases
- Signer review and correction before speech playback
- Realtime speech captions
- Text-to-speech voice selection
- Confidence-aware handling: uncertain recognition should prompt a correction or phrase selection
- Privacy-first design: camera processing should run locally when practical; do not store recordings by default
- Responsive, mobile-first web experience
Technology
- Frontend: Next.js, React, TypeScript
- Camera / microphone: Browser MediaDevices APIs
- Landmark tracking: MediaPipe Tasks Vision (web)
- Speech-to-text: ElevenLabs Realtime Speech-to-Text API
- Text-to-speech: ElevenLabs Text-to-Speech API
- Backend: Next.js route handlers or a small API service for secret management and temporary STT tokens
MediaPipe provides tracking and gesture-recognition building blocks; it does not provide unrestricted ASL translation. A separate model and an appropriate signer-recorded dataset are needed for the supported vocabulary.
