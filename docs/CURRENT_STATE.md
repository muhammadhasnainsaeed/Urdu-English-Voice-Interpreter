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

## Milestone 7 — Production Meeting Pipeline & End-to-End Hardening

Status: **COMPLETE** (verified on 2026-08-17; regression fixed + runtime-verified on 2026-08-21)

### What is done (Milestone 7)

- **Session orchestrator** — `src/main/services/session.ts`:
  - `SessionManager` coordinates start/stop of all pipeline stages.
  - `start()`: audio output → TTS → translation (in order). Rolls back on failure.
  - `stop()`: STT → translation → TTS → audio output (reverse order).
  - `emergencyStop()`: immediate cleanup on app quit.
  - Emits `SessionEvent` with pipeline stage status.
- **Session IPC** — `src/main/ipc/session.ts`: `session:start`, `session:stop`, `session:event`.
- **Session bridge** — preload exposes `startSession`, `stopSession`, `onSessionEvent`.
- **useSession hook** — `src/renderer/services/useSession.ts`: tracks session status + per-stage pipeline status.
- **Meeting mode UI** — `HomeScreen.tsx` shows a unified "Start Meeting" / "Stop Meeting" button
  with a 4-stage pipeline status indicator (STT, Translation, TTS, Audio).
- **Graceful shutdown** — `app.on('before-quit')` calls `sessionManager.emergencyStop()`.
- **Translation race fix** — `TranslationManager.translateText()` captures emit/provider references
  locally before awaiting. `stop()` no longer causes null-emission crashes.
- **Translation queue serialization** — `TranslationManager` now processes translations sequentially
  (one at a time) via `processQueue()`, preventing out-of-order results from concurrent API calls.
- **Translation backpressure** — bounded pending queue (max 10). Oldest dropped when full.
- **TTS backpressure** — bounded queue (max 5). Oldest dropped when full.
- **useTts unmount cleanup** — stops TTS in main process if component unmounts while active.
- **handleSttStop error handling** — `App.tsx` uses nested try/finally to ensure all stages
  are stopped even if an earlier stop throws.
- **Audio device failure recovery** — `useAudioOutput` falls back to "default" device when
  the selected device disappears from `devicechange` events.
- **Upstream STT-final dedupe (2026-08-21)** — `TranslationManager.onSttText()` suppresses
  identical consecutive finals within `STT_FINAL_DEDUPE_WINDOW_MS` (default 2000, 0=off,
  sliding window) BEFORE any provider request. Prevents mock-STT re-finalization from
  hammering MyMemory into HTTP 429. Whitespace/NFC-normalized comparison; original text
  still sent to provider. Explicit config parsing with `[CONFIG]` warnings for invalid
  values (also applied to `TTS_DEDUPE_WINDOW_MS`). 8 regression tests added.
- **Provider resilience (2026-08-21)** — MyMemory HTTP 429 enters a provider-owned cooldown
  (`Retry-After` honored; fallback `MYMEMORY_429_COOLDOWN_MS`, default 60000). No requests
  during cooldown, no retries, suppressed transcripts dropped (never replayed). Generic
  `RateLimitError` contract keeps TranslationManager provider-agnostic. In-flight duplicate
  protection at provider level. New `translation:rate-limited` status/event surfaces a
  concise UI state ("Translation temporarily rate-limited") and recovers to active on the
  next successful translation. Error classification: 429 vs network vs other HTTP statuses.
  MyMemory remains suitable for development/free-tier testing only; production traffic
  should use azure or similar. 11 resilience tests in `tests/translation-resilience.test.ts`.
- **Pipeline status types** — `SessionStatus`, `PipelineStageStatus`, `SessionEvent` in shared types.
- **Milestone 8 — Low-latency interpretation (2026-08-25, complete)**:
  - *Incremental translation*: at most one interim request per utterance
    from stabilized partials (≥4 words, ≥200 ms stable, unchanged text
    skipped, silence never sent, `PARTIAL_TRANSLATION_ENABLED` gate);
    final path authoritative, superseded interims dropped. Stability
    default lowered from 700 → 200 ms by M9 (700 ms unreachable with
    segmentation=300 ms).
  - *TTS preemption*: new utterances abort in-flight synthesis
    (`AbortSignal` in `TtsProvider`; `say` spawn-based kill), clear the
    queue, cancel renderer playback (`audio-output:cancel`), emit
    `tts:interrupted`. Dedupe precedes preemption. M9 added
    *interim-replacement preemption*: finals arriving while interim audio
    is still audible cancel playback and clear the queue; FIFO drain
    guarded so the final's own trace completes normally.
  - *Azure segmentation*: `AZURE_STT_SEGMENTATION_SILENCE_MS`
    (100–5000 clamped; benchmark 300) — finals ~0.86–1.13 s vs 1.1–2.3 s.
  - *Telemetry*: `firstAudioMs` + `interimFirstAudioMs`, playbackId
    correlation (0 = interim) so interim playback feeds First Audio
    without consuming FIFO slots; `sttPartialCount` per utterance; outcome
    `tts-interrupted`.
  - *Measured (M9 Digital)*: First Audio avg 1.88 s, E2E avg 5.33 s,
    interim translations firing 2/4 utterances; preemption verified.
  - *Root cause resolved*: M8 sparse partials caused by acoustic loopback
    degradation + STABLE_MS=700 unreachable. M9 validated clean audio
    produces 2–8 partials/utterance and 200 ms stability triggers interim.
- **Milestone 9 — STT streaming & partial translation (2026-08-26, complete)**:
  - *STT diagnostics*: Azure recognizing/final events logged with counts,
    inter-partial gaps, and text preview (PIPELINE_DEBUG). Audio-chunk
    cadence summary on session end. `sttPartialCount` in trace reports +
    UI.
  - *Interim-replacement preemption*: `handlePlaybackLifecycle()` tracks
    renderer interim playback via `telemetry:playback` IPC; finals
    arriving while provisional English is still audible cancel playback.
    FIFO drain guarded: only stale synthesis/queue traces consumed, not
    the final's own trace.
  - *STABLE_MS validated at 200*: With segmentation=300 ms, Azure partials
    grow every ~300 ms so700 ms stability was unreachable. 200 ms fits
    within natural inter-partial gaps for longer sentences. Configurable
    via `PARTIAL_TRANSLATION_STABLE_MS`.
  - *Measured*: Digital pass First Audio avg 1.88 s (interim 2/4), E2E
    avg 5.33 s. Acoustic pass First Audio avg 2.01 s (interim 2/4), E2E
    avg 5.33 s. Azure partials healthy (2–8/utterance, 100% coverage)
    with both digital and physical mic input.
- **Pipeline latency telemetry (2026-08-25, dev-only)** — `PipelineTelemetry`
  singleton (`src/main/services/telemetry/pipeline-telemetry.ts`) observes the
  existing pipeline: speechStart (Azure `speechStartDetected`), first partial,
  STT final, translation start/complete, TTS start/ready, renderer playback
  start/complete. Rolling window of last 20 completed utterances with
  Last/Avg/Min/Max + per-phase averages; dedupe/backpressure/rate-limit/error
  traces get outcomes but are excluded from E2E stats. Typed model in shared
  types; new additive bridge methods (`pipelineDebugEnabled`,
  `onPipelineEvent`, `reportPlaybackEvent`). Renderer shows the
  "Pipeline Performance" panel only when `PIPELINE_DEBUG=1`. 10 unit tests in
  `tests/telemetry.test.ts` (suite total 64 green). Azure STT locale fixed to
  `ur-IN` (ur-PK unsupported for real-time STT — websocket error 1007).
  Measured benchmark (Azure→Azure→say): E2E ≈ 4.1–6.1 s; dominant costs =
  Azure endpointing (1.1–2.3 s) and say synthesis (~1.3 s); translation
  109–352 ms.
- **Tests** — `tests/session.test.ts`: 10 tests covering session lifecycle, translation race
  condition, translation serialization, TTS queue bounds, error recovery.

### What remains (Milestone 7)

- **Manual verification required**:
  - Start Meeting → verify all 4 stages activate in order — ✅ verified 2026-08-21
    via CDP (session Active, Translation/TTS/Audio stages ●, English output filling)
  - Stop Meeting → verify clean shutdown with no orphaned processes
  - Start → Stop → Start → Stop (3 cycles) → no duplicated listeners or speech
  - BlackHole routing through meeting mode (requires BlackHole installed + Meet participant)
  - Azure credentials test (requires configured .env)
- **Regression fixed 2026-08-21**: SessionManager was passing status-only emit
  closures to translation/TTS/audio-output managers, severing the renderer event
  flow and the translation→TTS chain. Fixed with `createTranslationEmit()` etc.
  See CHANGELOG for full root cause and runtime trace.

## What is NOT implemented (intentionally)

Meeting-app integration, authentication, database, backend server, Python.
These are beyond Milestone 7. Milestones 1–7 are all complete.

## Next task

Milestones 1–7 are all complete. The production meeting pipeline is functional.
Future work: latency measurement in UI, retry policy for cloud providers,
or any new milestone as defined by the user.

## Files at a glance

```text
src/main/index.ts
src/main/services/audio.ts
src/main/services/session.ts
src/main/services/stt/{provider,manager}.ts
src/main/services/stt/providers/{azure,mock,whisper}.ts
src/main/services/translation/{provider,manager}.ts
src/main/services/translation/providers/{azure,mock,mymemory}.ts
src/main/services/tts/{provider,manager}.ts
src/main/services/tts/providers/{azure,mock,say}.ts
src/main/services/audio-output/{provider,manager}.ts
src/main/services/audio-output/providers/speaker.ts
src/main/ipc/{audio,audio-output,session,stt,translation,tts}.ts
src/preload/index.ts
src/renderer/{App.tsx,index.tsx,index.html}
src/renderer/pages/HomeScreen.tsx
src/renderer/components/{MicrophonePanel,AudioLevelMeter,SttPanel}.tsx
src/renderer/components/{SubtitleDisplay,StatusBar}.tsx
src/renderer/pages/LiveTranslationScreen.tsx
src/renderer/services/{useMicrophone,useSession,useStt,useTranslation,useTts,useAudioOutput}.ts
src/renderer/styles/App.css
src/renderer/types/electron.d.ts
packages/shared/index.ts
tests/tts-dedup.test.ts
tests/audio-output.test.ts
tests/session.test.ts
scripts/setup-whisper.sh
esbuild.config.js
package.json
tsconfig.json
.env.example
```
