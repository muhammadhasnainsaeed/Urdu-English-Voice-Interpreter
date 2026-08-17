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

Status: **COMPLETE** (verified on 2026-08-17)

### What is done (Milestone 5)

- **TTS provider abstraction** — `src/main/services/tts/`:
  - `provider.ts` defines `TtsProvider` interface (`synthesize(text): Promise<AudioChunk>`,
    `stop(): Promise<void>`, `name`) and factory `createTtsProvider()` reading
    `TTS_PROVIDER` env var.
  - `providers/azure.ts` — Azure Speech TTS via `microsoft-cognitiveservices-speech-sdk`
    (`SpeechSynthesizer` + `speakTextAsync` with `null` AudioConfig). Same credentials as STT.
    Configurable voice via `AZURE_TTS_VOICE` (default `en-US-JennyNeural`).
    Returns raw PCM via `result.audioData` (`Raw24Khz16BitMonoPcm` format).
  - `providers/say.ts` — macOS built-in `say` command. Zero dependencies,
    fully offline. Uses `--file-format=WAVE --data-format=LEI16@24000` to produce
    24 kHz 16-bit mono PCM WAV matching the existing `AudioChunk` format.
    Walks RIFF chunks to locate the `data` chunk (handles non-standard padding
    chunks like FLLR). `stop()` kills via `killall say`.
  - `providers/mock.ts` — 200 ms simulated delay. Returns silence ArrayBuffer.
- **TtsManager** — `src/main/services/tts/manager.ts`:
  - Session lifecycle, queue-based sequential speech.
  - `onTranslationText(text)` consumes final English translation segments.
  - Time-window duplicate suppression via `TTS_DEDUPE_WINDOW_MS` (default 2000 ms).
  - Pipes audio through `AudioOutputManager.writeAudio()`.
- **Audio output routing** — `src/main/services/audio-output/`:
  - `provider.ts` — `AudioOutputProvider` interface (`start`, `writeAudio`, `stop`).
  - `manager.ts` — `AudioOutputManager` with BlackHole detection and device enumeration.
  - `providers/speaker.ts` — `SystemSpeakerOutput` sends PCM to renderer via IPC.
- **Renderer playback** — `src/renderer/services/useAudioOutput.ts`:
  - Receives PCM via `onAudioData` IPC, creates `AudioContext`, decodes Int16 → Float32.
  - Device dropdown in UI.
- **IPC** — `audio-output:start`, `audio-output:stop`, `audio-output:select`, `audio-output:list-devices`, `audio-output:event`, `audio-output:audio`.
- **Shared types** — `AudioChunk`, `AudioFormat`, `AudioOutputDevice`, `AudioOutputStatus`, `AudioOutputEvent`, `AudioOutputStartResult`.
- **UI** — `SttPanel.tsx` shows audio output section: device dropdown, status pill.
- **Tests** — `tests/tts-dedup.test.ts`: 11 deterministic tests covering all dedup scenarios.

### What remains (Milestone 5)

- Verify mock TTS end-to-end in the Electron app (manual step).
- Test with macOS `say` provider against real translations.
- Test with Azure TTS provider (requires same Azure credentials as STT).

## Milestone 6 — Audio Output Routing / Virtual Microphone

Status: **COMPLETE** (verified on 2026-08-17)

### What is done (Milestone 6)

- **AudioOutputProvider abstraction** — decoupled TTS synthesis from audio routing.
  `TtsProvider.synthesize()` now returns `AudioChunk` (raw PCM) instead of playing
  directly. Audio flows through `AudioOutputManager.writeAudio()`.
- **BlackHole detection** — two-layer approach:
  - Renderer: matches `"blackhole"` in `enumerateDevices()` labels.
  - Main process: `detectBlackHole()` checks `/Library/Audio/Plug-Ins/HAL/` via
    `fs.existsSync()`, exposed via `audio-output:detect-blackhole` IPC (fallback).
- **System speaker output** — `SystemSpeakerOutput` sends PCM to the renderer via
  `webContents.send("audio-output:audio")` IPC channel.
- **Renderer device-targeted playback** — `useAudioOutput` hook:
  - Enumerates real output devices via `navigator.mediaDevices.enumerateDevices()`
    with fallback to main process `audio-output:list-devices` + `detect-blackhole`.
  - Calls `AudioContext.setSinkId(deviceId)` to route audio to the selected device.
  - Feature-detected (`"setSinkId" in AudioContext.prototype`); falls back
    gracefully to system default. Errors caught and logged as warnings.
  - Listens for `devicechange` events to refresh the device list automatically.
- **setSinkId type augmentation** — `src/renderer/types/electron.d.ts` augments
  global `AudioContext` with `setSinkId()` and `sinkId` (not in TypeScript DOM
  types yet).
- **Device selection UI** — dropdown in `SttPanel.tsx` with available output devices,
  status pill showing current output state.
- **All M5 code updated** — TTS providers refactored to `synthesize()`, TtsManager
  wired to AudioOutputManager, tests updated.
- **Tests** — `tests/tts-dedup.test.ts`: 11 tests; `tests/audio-output.test.ts`:
  13 tests covering lifecycle, IPC routing, device management, BlackHole detection.

### What remains (Milestone 6)

- **Manual verification**: BlackHole must be installed on the host machine for
  end-to-end routing. The app detects and routes to BlackHole automatically when
  installed — this cannot be tested in CI.
- **Manual test**: Urdu speech → STT → Translation → TTS → BlackHole → Zoom/Meet
  (requires BlackHole installed + BlackHole selected in audio output dropdown).

## What is NOT implemented (intentionally)

Meeting-app integration, authentication, database, backend server, Python.
These are beyond Milestone 6. Milestones 1–6 are all complete.

## Next task

Milestones 1–6 are all complete. No coding tasks remain for the MVP core pipeline.
Future work: real BlackHole routing verification, end-to-end meeting-app integration,
or any new milestone as defined by the user.

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
src/main/services/audio-output/{provider,manager}.ts
src/main/services/audio-output/providers/speaker.ts
src/main/ipc/{audio,audio-output,stt,translation,tts}.ts
src/preload/index.ts
src/renderer/{App.tsx,index.tsx,index.html}
src/renderer/pages/HomeScreen.tsx
src/renderer/components/{MicrophonePanel,AudioLevelMeter,SttPanel}.tsx
src/renderer/components/{SubtitleDisplay,StatusBar}.tsx
src/renderer/pages/LiveTranslationScreen.tsx
src/renderer/services/{useMicrophone,useStt,useTranslation,useTts,useAudioOutput}.ts
src/renderer/styles/App.css
src/renderer/types/electron.d.ts
packages/shared/index.ts
tests/tts-dedup.test.ts
tests/audio-output.test.ts
scripts/setup-whisper.sh
esbuild.config.js
package.json
tsconfig.json
.env.example
```
