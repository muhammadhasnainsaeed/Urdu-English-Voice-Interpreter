# Current State

_Last updated: 2026-08-17_

## Milestone 1 — Project Architecture & Electron Foundation

Status: **COMPLETE** (verified from code on 2026-08-16)

## Milestone 2 — Microphone Capture & Audio Device Detection

Status: **COMPLETE** (verified on 2026-08-16)

## Milestone 3 — Speech-to-Text (Urdu)

Status: **COMPLETE** (verified on 2026-08-16)

## Milestone 4 — Urdu → English Translation + Live Subtitles

Status: **COMPLETE** (verified on 2026-08-17)

## Milestone 5 — Text-to-Speech

Status: **IN PROGRESS** (started 2026-08-17)

### What is done (Milestone 5)

- **TTS provider abstraction** — `src/main/services/tts/`:
  - `provider.ts` defines `TtsProvider` interface (`speak(text): Promise<void>`,
    `stop(): Promise<void>`, `name`) and factory `createTtsProvider()` reading
    `TTS_PROVIDER` env var.
  - `providers/azure.ts` — Azure Speech TTS via `microsoft-cognitiveservices-speech-sdk`
    (`SpeechSynthesizer` + `speakTextAsync`). Same credentials as STT.
    Configurable voice via `AZURE_TTS_VOICE` (default `en-US-JennyNeural`).
  - `providers/say.ts` — macOS built-in `say` command. Zero dependencies,
    fully offline, `Samantha` voice at 200 wpm. `stop()` kills via `killall`.
    Platform-isolated for future Windows/Linux porting.
  - `providers/mock.ts` — 200 ms simulated delay. No audio output.
- **TtsManager** — `src/main/services/tts/manager.ts`:
  - Session lifecycle, queue-based sequential speech.
  - `onTranslationText(text)` consumes final English translation segments.
  - Time-window duplicate suppression: identical text is suppressed only when
    it arrives within the configurable dedup window (default 2000 ms via
    `TTS_DEDUPE_WINDOW_MS`). Different text is always spoken. Identical text
    after the window expires is spoken again.
  - Queue: multiple rapid translations spoken in order.
  - Emits `TtsEvent`s to the renderer via IPC.
- **TTS IPC** — `src/main/ipc/tts.ts`: `tts:start`, `tts:stop`, `tts:event`.
- **Translation → TTS wiring** — `src/main/ipc/translation.ts` accepts optional
  `onTranslationText` callback; `src/main/index.ts` wires it to
  `ttsManager.onTranslationText()`.
- **Preload bridge** — `startTts()`, `stopTts()`, `onTtsEvent(handler)` added.
- **Shared types** — `TtsStatus`, `TtsEvent`, `TtsStartResult`.
- **Renderer hook** — `src/renderer/services/useTts.ts`: manages TTS state.
- **UI** — `SttPanel.tsx` shows TTS section: status, provider, speaking text,
  Start/Stop TTS buttons (disabled until translation is active).
- **App.tsx** — owns `useTts` hook; stopping STT also stops TTS.
- **CSS** — `.tts-section`, `.tts-speaking-box`, `.status-tts-*` styles.
- **.env.example** — `TTS_PROVIDER` (azure/say/mock), `AZURE_TTS_VOICE`,
  `TTS_DEDUPE_WINDOW_MS`.
- **Tests** — `tests/tts-dedup.test.ts`: 11 deterministic tests covering all
  dedup scenarios (fake clock, instant mock provider).

### What remains (Milestone 5)

- Verify mock TTS end-to-end in the Electron app (manual step).
- Test with macOS `say` provider against real translations.
- Test with Azure TTS provider (requires same Azure credentials as STT).
- Verify existing STT + Translation providers still work after wiring changes.
- Finalize all M5 docs.

## What is NOT implemented (intentionally)

BlackHole, virtual microphone output, meeting-app integration, database,
authentication, backend server, Python. These belong to Milestone 6+.

## Next task

Milestone 5 is in progress. Verify mock TTS end-to-end, then test with
`say` or Azure TTS. After that, finalize docs.

## Files at a glance

```text
src/main/index.ts
src/main/services/audio.ts
src/main/services/stt/{provider,manager}.ts
src/main/services/stt/providers/{azure,mock,whisper}.ts
src/main/services/translation/{provider,manager}.ts
src/main/services/translation/providers/{azure,mock,mymemory}.ts
src/main/services/tts/{provider,manager}.ts
src/main/services/tts/providers/{azure,mock,say}.ts
src/main/ipc/{audio,stt,translation,tts}.ts
src/preload/index.ts
src/renderer/{App.tsx,index.tsx,index.html}
src/renderer/pages/HomeScreen.tsx
src/renderer/components/{MicrophonePanel,AudioLevelMeter,SttPanel}.tsx
src/renderer/components/{SubtitleDisplay,StatusBar}.tsx
src/renderer/pages/LiveTranslationScreen.tsx
src/renderer/services/{useMicrophone,useStt,useTranslation,useTts}.ts
src/renderer/styles/App.css
src/renderer/types/electron.d.ts
packages/shared/index.ts
scripts/setup-whisper.sh
esbuild.config.js
package.json
tsconfig.json
.env.example
```
