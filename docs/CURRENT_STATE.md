# Current State

_Last updated: 2026-08-16_

## Milestone 1 — Project Architecture & Electron Foundation

Status: **COMPLETE** (verified from code on 2026-08-16)

## Milestone 2 — Microphone Capture & Audio Device Detection

Status: **COMPLETE** (verified on 2026-08-16)

## Milestone 3 — Speech-to-Text (Urdu)

Status: **COMPLETE** (verified on 2026-08-16)

## What is done (Milestone 3)

- **STT provider abstraction** — `src/main/services/stt/`:
  - `provider.ts` defines the `SttProvider` interface
    (`start(handlers)`, `pushAudio(16 kHz mono 16-bit PCM)`, `stop`) and the
    shared 16 kHz sample-rate constant.
  - `manager.ts` owns a singleton `SttSession`: starts/stops the provider,
    forwards events to the renderer, guards against double-starts, and
    selects the provider from the `STT_PROVIDER` env var:
    - `azure` (default) — Azure Speech service via
      `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` (loaded lazily by dynamic
      `import()`, so mock mode never loads the SDK).
    - `mock` — no API key; emits incremental fake Urdu partial/final text
      triggered by real audio chunks, so tests exercise the full
      renderer → IPC → main path.
    - missing keys / unknown provider → `{ok:false, message}` with an
      actionable error; the app never crashes.
  - `providers/azure.ts` — `SpeechRecognizer` (ur-PK, continuous
    recognition) fed by a `PushAudioInputStream`; `recognizing` →
    `partial`, `recognized` → `final`, `canceled` → `error` + session teardown.
  - `providers/mock.ts` — development/test provider.
- **STT IPC** — `src/main/ipc/stt.ts` registers `stt:start` (invoke),
  `stt:audio-data` (fire-and-forget send, payload validated to
  `ArrayBuffer`/typed arrays), `stt:stop` (invoke), and broadcasts
  `stt:event` (`started` / `partial` / `final` / `error` / `stopped`) to the
  renderer.
- **Preload bridge** — `startStt()`, `sendSttAudio(chunk)`,
  `stopStt()`, `onSttEvent(handler) → unsubscribe` added to `ElectronAPI`.
- **Main wiring** — `src/main/index.ts` now imports `dotenv/config` (loads
  `.env` in the main process only), tracks the current `BrowserWindow`, and
  registers `registerSttIpc()`.
- **Renderer STT hook** — `src/renderer/services/useStt.ts`:
  - Taps the existing Milestone 2 mic capture with a `ScriptProcessorNode`
    (routed through a zero-gain node so there is no audible feedback).
  - Resamples `audioContext.sampleRate` → 16 kHz (linear interpolation with a
    carry-over tail buffer) and converts Float32 → Int16 PCM.
  - Streams chunks over `window.electron.sendSttAudio` and maintains
    `SttStatus` (`idle | starting | listening | processing | stopping | error`),
    partial text, final text (newline-appended), and errors from `stt:event`.
- **UI** — `src/renderer/components/SttPanel.tsx`: "Speech Recognition" panel
  with Language: Urdu, Status, a Live Transcript box (final text +
  italicized partial text, RTL), and Start Listening / Stop Listening buttons.
  `HomeScreen.tsx` renders it below the microphone panel; `App.tsx` owns both
  hooks and wires them (STT start first ensures mic capture; stopping either
  stops the other; error paths never crash).
- **Shared types** — added `SttStatus`, `SttEvent`, `SttStartResult`; extended
  `ElectronAPI`.
- **Dependencies** — `dotenv` (bundled into main) and
  `microsoft-cognitiveservices-speech-sdk` (kept external in the esbuild main
  bundle and `require`d lazily). `.env.example` documents `STT_PROVIDER`,
  `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`.

## STT provider decision (documented in `docs/ARCHITECTURE.md`)

**Azure Speech service** was chosen as the Milestone 3 provider after
evaluating (2026 data): true streaming with interim (partial) results, `ur-PK`
Urdu support, ~320 ms latency, official npm SDK that runs in the Electron main
process (key + region auth), 5 free audio hours/month then ~$1–1.40/hr.
Alternatives: Google Cloud STT (streaming + interim but service-account auth
and last-place real-time accuracy in 2026 benchmarks), Deepgram (lower
latency, newer/less-proven Urdu), OpenAI Whisper (best raw Urdu accuracy but
no true streaming), local Vosk (native dep + Electron ABI rebuild). The
`SttProvider` abstraction lets any of these replace Azure later without
touching the renderer.

## Milestone 3 validation (latest run)

- `npm run type-check` — passes (0 errors)
- `npm run build` — succeeds; `dist/renderer/index.html` produced; Azure SDK
  is external to `dist/main/index.js` (lazy `require`) and absent from
  `dist/renderer/bundle.js`
- Renderer bundle grep — clean: no key names, no SDK references, no
  `process.env`
- Main-process tests (bundled real manager + mock provider):
  - `STT_MOCK_PASS` — mock start → started event; pushing PCM chunks produces
    growing `partial` Urdu text then a `final`; stop clears the session;
    restart after stop works.
  - `STT_ERR_PASS` — `azure` without keys → `{ok:false}` with an actionable
    message, session not active; unknown provider → `{ok:false}`.
- Electron UI tests (real preload + real renderer bundle, `STT_PROVIDER=mock`,
  permission already granted):
  - `STT_API_SURFACE` — all 4 STT methods exposed on `window.electron`.
  - `STT_UI_RENDERED` — panel renders with Language: Urdu and Start button.
  - `STT_UI_START` — clicking Start Listening → mic capture + session start,
    status Listening, transcript flowing.
  - `STT_UI_TRANSCRIPT` — partial and final Urdu text appear
    (`"آپ کی آواز سنائی دے رہی ہے"`).
  - `STT_UI_STOP` — Stop Listening → status Idle, Start button restored.
  - `STT_UI_MIC_STOPPED` — stopping STT also stops mic capture (mic panel back
    to Start/Ready).
  - `STT_MISSING_KEY_UI_PASS` — with `STT_PROVIDER=azure` and no key, clicking
    Start shows Status: Error + actionable message, Start button remains, app
    stays alive (no crash).
- `npx electron .` — real app launches and stays alive with no errors.
- Note: real Azure recognition (key + spoken Urdu) is NOT verifiable by
  automation; it is a manual step (see below). Also note
  `ScriptProcessorNode` deprecation warning is expected (see ARCHITECTURE.md).

## Manual verification still needed (by the user)

Automation cannot speak into a microphone or provide your API key. To verify
real recognition:

1. Copy `.env.example` to `.env`, set `STT_PROVIDER=azure`,
   `AZURE_SPEECH_KEY`, and `AZURE_SPEECH_REGION` (any Azure region where
   Speech is available, e.g. `eastus`).
2. Run `npm start`, pick a microphone, and click **Start Listening**.
3. Speak Urdu — confirm partial text appears in real time and finalizes into
   the transcript.
4. Test error handling: clear the key in `.env`, restart, and confirm the app
   shows a clear error instead of crashing.
5. For a keyless demo, set `STT_PROVIDER=mock` and watch fake Urdu text flow.

## What is NOT implemented (intentionally)

Urdu → English translation, AI APIs for translation, text-to-speech, BlackHole,
virtual microphone output, meeting-app integration, database, authentication,
backend server, Python. These belong to Milestone 4+.

## Next task

Milestone 4 — Urdu → English translation: translate each finalized Urdu
utterance (from the STT `final` events) to English via an AI provider behind a
`services/translation/` abstraction, and show live subtitles (the existing
`LiveTranslationScreen` / `SubtitleDisplay` / `StatusBar` stubs are the
starting point). Do not begin until the user verifies Milestone 3 manually and
says to continue.

## Files at a glance

```text
src/main/index.ts
src/main/services/audio.ts
src/main/services/stt/{provider,manager}.ts
src/main/services/stt/providers/{azure,mock}.ts
src/main/ipc/{audio,stt}.ts
src/preload/index.ts
src/renderer/{App.tsx,index.tsx,index.html}
src/renderer/pages/HomeScreen.tsx
src/renderer/components/{MicrophonePanel,AudioLevelMeter,SttPanel}.tsx
src/renderer/components/{SubtitleDisplay,StatusBar}.tsx        (M4 stubs)
src/renderer/pages/LiveTranslationScreen.tsx                   (M4 stub)
src/renderer/services/{useMicrophone,useStt}.ts
src/renderer/styles/App.css
src/renderer/types/electron.d.ts
packages/shared/index.ts
esbuild.config.js
package.json
tsconfig.json
.env.example
```
