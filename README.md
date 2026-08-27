# Urdu-English Voice Interpreter

Real-time Urdu-to-English voice interpretation for macOS meetings. Speak Urdu
into your microphone, see the live transcript and English translation, and send
the translated English voice to a selected output device such as BlackHole for
use in Google Meet, Zoom, or Microsoft Teams.

## Current release: v1.0.0

This is the first public open-source release of the project.

- **What is included:** the complete M1–M10 Phase 2 pipeline — Urdu speech-to-text
  (`ur-IN`), Urdu → English translation, live subtitles, English TTS, and audio
  routing to a selectable output device (including BlackHole). Azure STT →
  Azure Translator → Azure streaming TTS is the production path; deterministic
  Mock and macOS `say` providers are preserved for local testing.
- **Validation status:** build, type-check, and 43 automated tests pass. The M10
  Phase 2 acoustic streaming benchmark is pending/manual and full real Google
  Meet / Zoom / Teams validation is pending/manual.
- **Demo:** video/screenshots coming soon.
- **Release notes:** [`docs/releases/v1.0.0.md`](docs/releases/v1.0.0.md)

## Project status

- The core M1–M10 Phase 2 implementation is complete and tested: microphone
  capture, Urdu speech-to-text, Urdu → English translation, live subtitles,
  English text-to-speech, and BlackHole audio-output routing.
- M10 streaming TTS is implemented, including cancellation, interim/final
  replacement, telemetry, and legacy-provider compatibility.
- The M10 Phase 2 **acoustic streaming benchmark is still pending** (manual,
  environment-dependent), so no end-to-end latency improvement is claimed yet.
- **Full real Google Meet / Zoom / Microsoft Teams validation is still
  pending** and is manual. No meeting-app API integration exists.
- **Azure credentials are required** for the production cloud path (Speech,
  Translator, and TTS keys). MyMemory is demo/fallback only. Deepgram, OpenAI,
  and other providers are future/optional work, not current requirements.
- BlackHole is required for virtual audio routing into a meeting app.
- The app has **no authentication system**, no backend service, no database,
  and no direct Google Meet/Zoom/Teams API integration.

## Complete application flow

```text
Mac microphone / BlackHole input
              ↓
Renderer microphone capture
  (resample to 16 kHz mono Int16 PCM)
              ↓ IPC
Speech-to-text provider
  Azure Speech (production) | Whisper (offline) | Mock (testing)
              ↓ Urdu partials/finals
Translation provider
  Azure Translator (production) | MyMemory (demo) | Mock (testing)
              ↓ English text
TTS manager
  deduplication → queue → preemption/cancellation
              ↓
TTS provider
  Azure streaming PCM | macOS say | Mock
              ↓ 24 kHz, 16-bit, mono PCM
Audio output manager
  device selection, BlackHole detection, routing
              ↓ IPC
Renderer WebAudio playback queue
              ↓
Selected output device
  Mac speakers / headphones / BlackHole
              ↓
Meeting application microphone
  Google Meet / Zoom / Microsoft Teams
```

Client or incoming meeting audio is not translated. The app translates only
audio captured from the selected local microphone.

## Features

- Azure real-time Urdu speech recognition (`ur-IN`)
- Offline Whisper STT and deterministic Mock STT alternatives
- Azure Urdu → English translation with MyMemory and Mock alternatives
- Azure streaming TTS with incremental PCM playback
- macOS `say` and Mock TTS alternatives
- Interim translation with authoritative final replacement
- TTS deduplication, FIFO queueing, bounded backpressure, and preemption
- Session-level Start/Stop orchestration with graceful cleanup
- BlackHole detection and selectable audio output devices
- Secure Electron preload bridge (`contextIsolation: true`, `nodeIntegration: false`)
- Development-only pipeline latency telemetry and performance panel
- TypeScript unit/regression test coverage for pipeline hardening

## Requirements

- macOS (Apple Silicon supported)
- Node.js 18+ and npm
- BlackHole 2ch for routing translated audio into a meeting app
- Azure Speech and Translator credentials for the production cloud path

## Quick start

```bash
npm install
cp .env.example .env
npm run type-check
npm run build
npm start
```

For development rebuilds:

```bash
npm run watch
```

## Configuration

The recommended production configuration is:

```dotenv
STT_PROVIDER=azure
TRANSLATION_PROVIDER=azure
TTS_PROVIDER=azure

AZURE_SPEECH_KEY=your_speech_key
AZURE_SPEECH_REGION=your_speech_region
AZURE_TRANSLATOR_KEY=your_translator_key
AZURE_TRANSLATOR_REGION=your_translator_region
AZURE_STT_SEGMENTATION_SILENCE_MS=300
PARTIAL_TRANSLATION_ENABLED=true
PARTIAL_TRANSLATION_STABLE_MS=200
```

Useful local/testing configurations:

```dotenv
# No cloud credentials; deterministic pipeline testing
STT_PROVIDER=mock
TRANSLATION_PROVIDER=mock
TTS_PROVIDER=mock

# Local macOS voice output
TTS_PROVIDER=say
```

See [`.env.example`](.env.example) for all provider, deduplication,
segmentation, and telemetry settings. Never commit real credentials.

MyMemory is intended for development or fallback testing only. Its anonymous
service is aggressively rate-limited; use Azure Translator or another
production-grade provider for sustained meeting traffic.

## BlackHole and meeting setup

1. Install BlackHole 2ch on macOS.
2. Start the app and select the desired translated-audio output device.
3. Select **BlackHole 2ch** as the microphone in Google Meet, Zoom, or Teams.
4. Start the meeting pipeline in the app.
5. Speak Urdu into the app's selected microphone.
6. Verify the English TTS is audible to the meeting participant.

For feedback isolation during acoustic testing, route app TTS to BlackHole and
play the Urdu test audio through MacBook speakers into the MacBook microphone.

## Validation

```bash
npm run type-check
npm run build
npm test
```

The automated suite (43 tests) covers session lifecycle, provider resilience,
duplicate suppression, telemetry, audio routing, streaming chunk ordering,
preemption, session-stop cancellation, and interim-to-final attribution.

Manual validation is still required for:

- BlackHole → Google Meet/Zoom/Teams end-to-end audio
- Azure credentials and real Urdu speech quality
- Start → Stop → Start session cycles
- Renderer playback on the selected physical output device
- The M10 Phase 2 acoustic before/after benchmark

## Repository layout

```text
src/main/       Electron main process and provider managers
src/preload/    Secure contextBridge API
src/renderer/   React UI, microphone capture, and WebAudio playback
packages/shared Shared TypeScript contracts
tests/          Deterministic unit and integration-style tests
docs/           Architecture, current state, and changelog
```

## Documentation

- [`docs/releases/v1.0.0.md`](docs/releases/v1.0.0.md) — v1.0.0 release notes
- [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) — milestone status and remaining work
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — dated implementation history
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — process boundaries and data flow
- [`AGENTS.md`](AGENTS.md) — repository workflow and validation rules
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — development and pull-request guide
- [`SECURITY.md`](SECURITY.md) — vulnerability reporting and secret handling
- [`LICENSE`](LICENSE) — MIT License

## Roadmap

- **M10 Phase 3 (planned):** production meeting-pipeline hardening and
  end-to-end validation of the streaming path.
- Full real meeting-app validation in Google Meet, Zoom, and Microsoft Teams.
- M10 Phase 2 acoustic streaming benchmark (manual, pending).
- Future/optional provider integrations (e.g., Deepgram, OpenAI) behind the
  existing provider abstractions.
- Reverse-direction (English → Urdu) and additional language pairs are
  possible future extensions.

## Scope boundaries

The MVP does not include authentication, a backend, a database, or native
meeting-app integrations. Python is not part of the target architecture.
