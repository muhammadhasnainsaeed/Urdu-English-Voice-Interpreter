# Changelog

Every agent working on this repository MUST append a dated entry describing
their changes after finishing work.

## 2026-08-25 — Pipeline latency telemetry + benchmark (Azure STT + Azure Translator + say)

### Added

- **Typed telemetry model** (`packages/shared/index.ts`): `UtteranceOutcome`,
  `UtteranceLatencyBreakdown`, `UtteranceTraceReport`, `PipelineSummary`,
  `PipelinePhaseAverages`, `PipelineEvent`, `PlaybackTelemetryEvent`; bridge
  additions `pipelineDebugEnabled`, `onPipelineEvent`, `reportPlaybackEvent`.
- **PipelineTelemetry singleton**
  (`src/main/services/telemetry/pipeline-telemetry.ts`): observes the
  existing pipeline without changing behavior. Timestamps: speechStart
  (service-detected onset), first partial, STT final, translation start/
  complete, TTS start/ready, playback start/complete. FIFO attribution per
  serialized stage handles overlapping utterances. Rolling window of last 20
  completed utterances; dedupe/backpressure/rate-limit/error traces recorded
  with outcomes but excluded from E2E stats. No credentials or raw audio in
  telemetry — transcript text and timings only.
- **Instrumentation points**: optional `SttHandlers.onSpeechStart` wired to
  Azure `speechStartDetected` (mock emits burst-start proxy); STT manager
  marks partial/final; TranslationManager marks dedupe/backpressure/start/
  success/rate-limit/error; TtsManager marks suppression/start/ready/error;
  AudioOutputManager resets pipeline state on stop; renderer reports real
  playback start/complete (`source.onended`) via new telemetry IPC.
- **Dev-only UI**: `PipelinePanel` component (visible when PIPELINE_DEBUG=1)
  showing per-phase latencies of the last utterance, End-to-End, current
  stage, Last/Avg/Min/Max, window count; styles in App.css.
- **Tests**: `tests/telemetry.test.ts` — 10 deterministic tests (breakdown
  math, exclusion outcomes, 20-cap window, FIFO overlap attribution,
  approximate onset, reset semantics). Suite total now **64 tests green**.
- `.env.example`: PIPELINE_DEBUG documented.

### Fixed (prerequisite for mandated runtime test)

- Azure STT locale `ur-PK` → `ur-IN` (`stt/manager.ts`). Real-time STT does
  not offer ur-PK (TTS/video-translation only) — resolves websocket error
  1007 approved in the prior investigation.

### Benchmark results (Azure centralindia, acoustic loopback via speakers→mic)

4 completed utterances (PIPELINE_DEBUG=1):

| Phase | Observed |
|---|---|
| speechStart → first partial | 103 ms (1 of 4 phrases emitted partials) |
| speechStart → STT final | 1121 / 1559 / 2234 / 2343 ms |
| translation (Azure Translator) | 331 / 109 / 199 / 352 ms |
| TTS (say) | 1421 / 1313 / 1353 / 1355 ms |
| audio output (playback duration) | 1713 / 1162 / 2323 / 2009 ms |
| End-to-end | 4593 / 4145 / 6111 / 6060 ms |
| E2E summary | Last 6.06s · Avg 5.65s · Min 4.15s · Max 6.11s |

Investigation findings: translation triggers ONLY from STT finals
(`translation/manager.ts` ignores non-finals); partials are unreliable
(3 of 4 phrases finalized with no partial events); dominant latency terms
are Azure endpointing (speechStart→final ≈ 1.1–2.3s) and macOS `say`
synthesis (~1.3s); first translation request pays ~220ms extra connection
setup.

## 2026-08-21 — Translation provider resilience: 429 cooldown, Retry-After, in-flight dedupe, rate-limited state

### Architecture decision

Reliability behavior lives at the **provider boundary**, not in
TranslationManager. A generic `RateLimitError` (exported from
`translation/provider.ts`) is the contract: any provider may throw it;
the manager surfaces a `translation:rate-limited` event without knowing
provider specifics. Switching `TRANSLATION_PROVIDER=mymemory` → `azure`
requires no manager changes. No retries, no retry loops, no background
workers, no SessionManager/STT/TTS changes.

### Changes

- **`src/main/services/translation/provider.ts`** — added generic
  `RateLimitError` (carries informational `retryAfterMs`).
- **`src/main/services/translation/config.ts`** (new) — shared
  `parseWindowMs()` (explicit validation, `[CONFIG]` warning on invalid);
  imported by manager + MyMemory provider (no import cycles). Manager
  re-exports it for compatibility.
- **`src/main/services/translation/providers/mymemory.ts`** — on HTTP 429:
  enters provider-owned cooldown (`Retry-After` delta-seconds or HTTP-date
  when valid; else `MYMEMORY_429_COOLDOWN_MS`, default 60000). During
  cooldown `translate()` fails fast with `RateLimitError` and makes NO HTTP
  request. Suppressed items are dropped — cooldown expiry never replays
  stale transcripts; the next legitimate STT final translates normally.
  Error classification without retries: 429 → RateLimitError; network
  failure → "network error"; other statuses → descriptive plain errors.
  In-flight dedupe: identical normalized concurrent texts share one
  request/promise.
- **`src/main/services/translation/manager.ts`** — catches
  `RateLimitError` separately: emits concise user-facing
  `translation:rate-limited` ("Translation temporarily rate-limited");
  raw errors stay in debug logs.
- **`packages/shared/index.ts`** — `TranslationStatus` gains
  `"rate-limited"`; event union gains `translation:rate-limited`.
- **Renderer** — `useTranslation` shows the rate-limited state and returns
  to active on the next successful translation; SttPanel label
  "Rate-limited"; amber CSS style.

### Request control (verified, pre-existing + new)

Sequential queue + MAX_PENDING=10 backpressure + STT-final sliding-window
dedupe already prevent bursts; provider-level in-flight dedupe closes the
slow-network gap. No artificial delays added.

### Tests

New `tests/translation-resilience.test.ts` (11 tests, stubbed fetch): 429
enters cooldown with zero HTTP during it; Retry-After delta-seconds honored
over fallback; past HTTP-date → immediate recovery; fallback cooldown
expires by time; in-flight duplicates share one request; 400/401/403/5xx/
network failures are NOT treated as rate-limit and never trigger cooldown;
manager surfaces rate-limited then recovers on next legitimate final; TTS
chain receives nothing while rate-limited. Total suite: **54 tests, all
passing** (13 audio-output + 19 session + 11 tts-dedup + 11 resilience).

### Runtime verification (real MyMemory, PIPELINE_DEBUG=1)

70s meeting: 44 STT finals → **1 HTTP request** (success) → 43 upstream-
deduped → 1 TTS invocation → 1 audio output. Zero errors/warnings. The 429
path itself is covered deterministically by mocked-429 tests (IP was not
limited at test time).

## 2026-08-21 — Upstream STT-final dedupe + explicit dedupe-window config parsing

### Root cause addressed

Mock STT re-finalizes the same sentence every ~1.54s while the mic feeds
audio. Each final previously triggered a new translation request (~40/min),
causing MyMemory HTTP 429 within minutes (per-IP limit persists across app
restarts). TTS dedupe only suppressed playback after translation had already
run, so requests were wasted upstream.

### Changes

- **`src/main/services/translation/manager.ts`**:
  - Upstream dedupe in `onSttText()` BEFORE any provider request. Identical
    consecutive finals within `STT_FINAL_DEDUPE_WINDOW_MS` (default 2000,
    0 = disabled) are suppressed. Sliding window: each duplicate refreshes
    the timer, so a continuously repeated transcript yields one request;
    a genuinely repeated phrase after the window expires is translated.
  - `normalizeForDedupe()`: NFC Unicode normalization + whitespace collapse +
    trim for comparison only; original text is sent to the provider.
  - Optional `dedupeWindowMs` constructor param (mirrors TtsManager).
  - Exported `parseWindowMs()`: absent → default; non-negative integer → use;
    anything else → `[CONFIG]` warning + fallback. No silent reinterpretation.
  - Dedupe state reset in `start()` and `stop()`.
- **`src/main/services/tts/manager.ts`**: replaced silent `parseInt` NaN
  fallback with the same explicit `parseWindowMs` behavior for
  `TTS_DEDUPE_WINDOW_MS` (`disable` now warns and falls back to 2000ms).
- **`.env.example`**: documented `STT_FINAL_DEDUPE_WINDOW_MS` and clarified
  both windows' semantics (0 disables; invalid values warn + fall back).
- **`.env`**: replaced invalid `TTS_DEDUPE_WINDOW_MS=disable` with valid values.

### Tests

8 new regression tests in `tests/session.test.ts` (19 total in suite, 43
overall): first final translated; identical-in-window ignored; identical
after window translated again; different text immediate; whitespace variants
deduped; window=0 disables; invalid env warns + falls back; provider not
called for suppressed duplicates.

### Runtime verification (PIPELINE_DEBUG=1, mock/mymemory-free config)

12s meeting: 7 STT finals → **1 translation request**, **6 DEDUPED**,
1 synthesize, 1 writeAudio (23904 bytes). Renderer English box contains
exactly one line. Previously: 7 requests / 7 translations / 4 TTS plays.

## 2026-08-21 — M7 Regression Fix: Session emit wiring broke translation→TTS chain

### Root cause

`SessionManager.start()` passed `() => this.emitStatus()` as the emit closure
to `translationManager.start()`, `ttsManager.start()`, and
`audioOutputManager.start()`. Unlike the IPC-level emit closures (which forward
events to the renderer AND chain `translation:text` → `ttsManager.onTranslationText`),
the session's status-only emitter silently dropped every pipeline event.
Result: translations completed but TTS never received any text — no synthesis,
no audio, no errors. The renderer also never received `translation:started`,
so Translation showed "Off" in the UI.

### Fix

`src/main/services/session.ts` — added `createTranslationEmit()`,
`createTtsEmit()`, and `createAudioOutputEmit()` factory methods that replicate
the exact IPC wiring: forward events to the renderer window via
`sendToRenderer()` and chain translation results into TTS. Replaced the three
broken `() => this.emitStatus()` calls in `start()`.

### Runtime verification (PIPELINE_DEBUG=1)

Full pipeline traced live in Electron with mock STT + MyMemory + say:

```
[SESSION] start requested → audio output started → TTS started (say)
          → translation started (mymemory) → session active
[TRANSLATION] onSttText final: آپ کی آواز سنائی دے رہی ہے
[TRANSLATION] emit → translation:text Your voice is heard
[TRANSLATION] chaining to TTS: Your voice is heard
[TTS] synthesize: Your voice is heard
[AUDIO] writeAudio, bytes: 40982   ← repeating every ~1.5s
```

Renderer DOM verified via CDP: session pill "Active", pipeline stages
Translation/TTS/Audio = ●, translation status "Active", English output box
filling with "Your voice is heard".

### Tests

- Added **"Regression: session start wires translation→TTS chain"** to
  `tests/session.test.ts` — starts a real session with mock providers, feeds
  Urdu text through `translationManager.onSttText()`, asserts TTS received the
  English translation. Verified this test FAILS against the broken code and
  PASSES after the fix. Total: 11 tests in suite, 35 across all suites.
- Diagnostic logging added behind `PIPELINE_DEBUG=1` env flag in
  `session.ts`, `translation/manager.ts`, `tts/manager.ts`.

## 2026-08-17 — Milestone 7: Production Meeting Pipeline & End-to-End Hardening

Implemented unified meeting mode, session orchestration, pipeline state
visibility, error recovery, backpressure, and bug fixes.

### New files

- **`src/main/services/session.ts`** — `SessionManager` orchestrates start/stop
  of all pipeline stages (audio output → TTS → translation → STT). Emits
  `SessionEvent` with per-stage status. `emergencyStop()` for app quit.
- **`src/main/ipc/session.ts`** — Session IPC handlers: `session:start`,
  `session:stop`, `session:event`. Wires `SessionManager` to renderer events.
- **`src/renderer/services/useSession.ts`** — React hook tracking session status,
  pipeline stage states, and errors.
- **`tests/session.test.ts`** — 10 deterministic tests: session lifecycle,
  translation race condition, translation serialization, TTS queue bounds,
  error recovery.

### Modified files

- **`src/main/index.ts`** — Registers session IPC. Adds `before-quit` handler
  calling `sessionManager.emergencyStop()`.
- **`src/main/services/translation/manager.ts`** — Fixed emit race condition:
  `translateText()` now captures `emit` and `provider` references locally before
  awaiting. Added sequential queue serialization (`processQueue()`). Added
  backpressure: bounded pending queue (max 10), oldest dropped when full.
- **`src/main/services/tts/manager.ts`** — Added bounded queue (max 5 items).
  When queue is full, oldest items are dropped (backpressure).
- **`src/preload/index.ts`** — Added `startSession`, `stopSession`,
  `onSessionEvent` to bridge.
- **`packages/shared/index.ts`** — Added `SessionStatus`, `PipelineStageStatus`,
  `SessionEvent`, `SessionStartResult` types. Added session methods to
  `ElectronAPI`.
- **`src/renderer/App.tsx`** — Added `useSession` hook. Added `handleMeetingStart`
  (session + mic + STT) and `handleMeetingStop` (session + mic cleanup). Fixed
  `handleSttStop` with nested try/finally. Added session auto-stop effect.
- **`src/renderer/pages/HomeScreen.tsx`** — Added meeting mode section with
  "Start Meeting" / "Stop Meeting" button and 4-stage pipeline status indicator.
- **`src/renderer/services/useTts.ts`** — Added unmount cleanup: stops TTS in
  main process if component unmounts while active.
- **`src/renderer/services/useAudioOutput.ts`** — Added audio device failure
  recovery: falls back to "default" when selected device disappears from
  `devicechange` events.
- **`src/renderer/styles/App.css`** — Added meeting mode section styles, pipeline
  stage indicators, start/stop meeting buttons.

## 2026-08-17 — Milestone 6: Audio output routing (initial implementation)

Refactored TTS to decouple synthesis from audio routing, added
AudioOutputProvider abstraction, and wired renderer-based playback.

## 2026-08-17 — Fix: macOS `say` TTS provider WAV output

Fixed `Opening output file failed: fmt?` error when running macOS `say` to
produce WAV files.

- **Root cause**: `say` without explicit `--file-format` and `--data-format`
  picks an incompatible default. Additionally, macOS `say` inserts a non-standard
  `FLLR` padding chunk before the `data` chunk, so the PCM audio does not start
  at the standard byte-44 offset — the hardcoded `raw.subarray(44)` read the
  wrong bytes.
- **Fix**: `say` command now passes `--file-format=WAVE --data-format=LEI16@24000`
  to produce a signed 16-bit little-endian PCM WAV at 24000 Hz, matching the
  existing `AudioChunk` format (no conversion needed).
- **Fix**: New `findDataChunk()` function walks RIFF chunks to locate the `data`
  chunk by ID instead of assuming a fixed offset. Handles any number of
  intermediate chunks (FLLR, etc.).
- **Verified**: `"Your voice is heard"` produces a valid WAV with PCM at
  24000 Hz / 16-bit / mono. All 24 existing tests pass. Type-check and build
  clean.

## 2026-08-17 — Milestone 6: Device-targeted playback + BlackHole detection (COMPLETE)

Implemented `setSinkId()` for device-targeted output, real renderer-side device
enumeration, BlackHole detection (renderer label + main process HAL fallback),
and audio-output test suite. Milestone 6 is now complete.

- **setSinkId() device targeting** — `src/renderer/services/useAudioOutput.ts`:
  calls `AudioContext.setSinkId(deviceId)` (Chrome 110+) to route audio to the
  selected output device. Feature-detected with
  `"setSinkId" in AudioContext.prototype`; falls back gracefully to system default.
  Errors are caught and logged as warnings (audio still plays).
- **Real renderer device enumeration** — `useAudioOutput` calls
  `navigator.mediaDevices.enumerateDevices()` on mount (with retry after
  `getUserMedia`) to discover real `audiooutput` device IDs and labels. Falls
  back to main process `audio-output:list-devices` + `detect-blackhole` IPC when
  enumeration returns nothing (before mic permission granted).
- **BlackHole detection — two layers**:
  1. Renderer: matches `"blackhole"` in `enumerateDevices()` device labels.
  2. Main process: `detectBlackHole()` exported from `AudioOutputManager`
     (checks `/Library/Audio/Plug-Ins/HAL/BlackHole*.driver` via `fs.existsSync()`).
     Exposed via `audio-output:detect-blackhole` IPC as fallback.
- **IPC added** — `audio-output:detect-blackhole` in `src/main/ipc/audio-output.ts`,
  `detectBlackHole` exposed in preload bridge and shared `ElectronAPI`.
- **setSinkId type augmentation** — `src/renderer/types/electron.d.ts` augments
  global `AudioContext` interface with `setSinkId(sinkId: string): Promise<void>`
  and `readonly sinkId: string` (not in TypeScript DOM types yet).
- **devicechange listener** — `useAudioOutput` subscribes to
  `navigator.mediaDevices.addEventListener("devicechange", ...)` to refresh the
  device list automatically when devices are plugged/unplugged.
- **devicechange in SttPanel** — device dropdown shows all discovered output
  devices. When BlackHole is detected, it appears alongside "System Default."
  Current device selection is shown with a pill indicator.
- **AudioOutputManager lifecycle** — `start()` sends `audio-output:start` IPC to
  renderer, `writeAudio()` sends `audio-output:audio` IPC, `stop()` sends
  `audio-output:stop` IPC. Selection and BlackHole detection persist across
  start/stop cycles.
- **Audio output tests** — `tests/audio-output.test.ts`: 13 deterministic tests
  covering lifecycle (start/stop), IPC routing (start/stop/audio), device
  management (selectDevice, getAvailableDevices), BlackHole detection (boolean
  return, platform-aware), and edge cases (write when inactive, write after
  stop, double-start). Uses mock provider and fake BrowserWindow.
- **Tests pass** — `npm run type-check` 0 errors, `npm run build` succeeds,
  11 + 13 = 24 tests all pass.

### Files modified

- `src/renderer/services/useAudioOutput.ts` — real device enumeration, setSinkId,
  BlackHole label detection, devicechange listener, fallback to main process IPC
- `src/renderer/types/electron.d.ts` — AudioContext setSinkId type augmentation
- `src/main/ipc/audio-output.ts` — added `audio-output:detect-blackhole` handler
- `src/main/services/audio-output/manager.ts` — exported `detectBlackHole()`
- `src/preload/index.ts` — added `detectBlackHole` to bridge
- `packages/shared/index.ts` — added `detectBlackHole` to ElectronAPI
- `src/renderer/components/SttPanel.tsx` — audio output device dropdown + status pill
- `src/renderer/styles/App.css` — `.audio-output-section`, `.status-pill` styles

### Files created

- `tests/audio-output.test.ts` — 13 tests for AudioOutputManager

- **TtsProvider refactored**: `speak(text): Promise<void>` →
  `synthesize(text): Promise<AudioChunk>` — providers now return raw PCM data
  instead of playing directly. Azure provider uses `null` AudioConfig +
  `Raw24Khz16BitMonoPcm` to get raw `result.audioData`. macOS `say` provider
  writes WAV to temp file, parses header, returns PCM slice. Mock provider
  returns silence ArrayBuffer.
- **AudioOutputProvider abstraction** — `src/main/services/audio-output/`:
  - `provider.ts` — `AudioOutputProvider` interface (`start`, `writeAudio`, `stop`).
  - `manager.ts` — `AudioOutputManager` with BlackHole detection (HAL driver
    path check), device enumeration, `selectDevice()`.
  - `providers/speaker.ts` — `SystemSpeakerOutput` sends PCM to renderer via
    `webContents.send("audio-output:audio")`.
- **TtsManager updated** — accepts `AudioOutputManager`, calls
  `provider.synthesize()` then `audioOutput.writeAudio()`.
- **TTS IPC updated** — `tts:start` now receives `audioOutputManager`.
- **Audio output IPC** — `src/main/ipc/audio-output.ts`: `audio-output:start`,
  `audio-output:stop`, `audio-output:select`, `audio-output:list-devices`.
- **Renderer playback** — `src/renderer/services/useAudioOutput.ts`: receives PCM
  via `onAudioData` IPC, creates `AudioContext`, decodes Int16 → Float32, plays
  via `AudioBufferSourceNode`.
- **App.tsx** — wired `useAudioOutput` hook; `handleTtsStart` also starts audio
  output; audio output props passed to `HomeScreen` and `SttPanel`.
- **SttPanel.tsx** — added audio output section: device dropdown, status pill.
- **Preload bridge** — added `getAudioOutputDevices`, `selectAudioOutput`,
  `startAudioOutput`, `stopAudioOutput`, `onAudioOutputEvent`, `onAudioData`.
- **Shared types** — added `AudioChunk`, `AudioFormat`, `AudioOutputDevice`,
  `AudioOutputStatus`, `AudioOutputEvent`, `AudioOutputStartResult`.
- **CSS** — added `.audio-output-section`, `.status-pill` styles.
- **Tests updated** — `tests/tts-dedup.test.ts` updated to use `synthesize()`
  API and new `start(emit, audioOutput, provider)` signature. All 11 tests pass.

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds, `dist/renderer/index.html` exists
- All 11 dedup tests pass

## 2026-08-17 — Milestone 5: TTS time-window duplicate suppression

Replaced the permanent `lastSpoken` string-match dedup in TtsManager with a
configurable time-window approach.

- **TtsManager** (`src/main/services/tts/manager.ts`):
  - `lastSpoken: string` → `lastSpokenText: string` + `lastSpokenTime: number`.
  - New constructor parameter `dedupeWindowMs` (defaults to
    `TTS_DEDUPE_WINDOW_MS` env var, then 2000 ms).
  - `onTranslationText()`: suppresses identical text only when it arrives
    within the dedup window of the last identical text. Different text is
    always spoken. Identical text after the window expires is spoken again.
  - `queueLength` getter added for test visibility.
  - `start()` accepts optional `providerOverride` for deterministic testing.
  - `stop()` resets dedup state.
- **.env.example** — added `TTS_DEDUPE_WINDOW_MS` (default 2000 ms, 0 = no
  dedup).
- **Tests** (`tests/tts-dedup.test.ts`) — 11 deterministic tests using a
  fake clock and instant mock provider:
  - A: same text repeated immediately → spoken once
  - B: same text after >2s → spoken again
  - C: different texts → all spoken
  - D: A → B → A → all three spoken
  - E: queue remains active after emptying
  - F: new translation after idle → spoken
  - Extras: exact boundary, dedup disabled (0ms), whitespace ignored,
    inactive manager ignored, stop resets state

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds
- All 11 tests pass via `npx tsx tests/tts-dedup.test.ts`

## 2026-08-17 — Milestone 5: Text-to-Speech (provider-based system)

Implemented TTS as a provider-based system with three providers (Azure cloud,
macOS say local, Mock testing) following the same abstraction pattern as STT
and Translation.

- **TTS provider abstraction** — `src/main/services/tts/`:
  - `provider.ts` defines `TtsProvider` interface (`speak(text)`, `stop()`,
    `name`) and factory `createTtsProvider()` reading `TTS_PROVIDER` env var.
  - `providers/azure.ts` — Azure Speech TTS via the same
    `microsoft-cognitiveservices-speech-sdk` used by the STT provider.
    `SpeechSynthesizer` + `speakTextAsync`. Auth via `AZURE_SPEECH_KEY` +
    `AZURE_SPEECH_REGION`. Configurable voice via `AZURE_TTS_VOICE` (default
    `en-US-JennyNeural`). Audio plays through the system default output.
  - `providers/say.ts` — macOS built-in `say` command. Zero dependencies,
    fully offline. Uses `Samantha` voice at 200 wpm. `stop()` kills the
    process via `killall say`. Platform-isolated for future Windows/Linux.
  - `providers/mock.ts` — simulates TTS with a 200 ms delay. For automated
    testing; no audio output.
- **TtsManager** — `src/main/services/tts/manager.ts`:
  - Session lifecycle (start/stop), queue-based sequential speech.
  - `onTranslationText(text)` — consumes final English translation segments.
  - Deduplication: same text repeated consecutively is not spoken twice.
  - Queue: multiple rapid translations are spoken in order (not dropped).
  - Emits `TtsEvent`s (`tts:started`, `tts:speaking`, `tts:spoken`,
    `tts:error`, `tts:stopped`) to the renderer via IPC.
- **TTS IPC** — `src/main/ipc/tts.ts`: `tts:start`, `tts:stop`, `tts:event`.
- **Translation → TTS wiring** — `src/main/ipc/translation.ts` now accepts
  optional `onTranslationText` callback; `src/main/index.ts` wires it to
  `ttsManager.onTranslationText()` so final English translations flow to TTS
  automatically.
- **Preload bridge** — `startTts()`, `stopTts()`, `onTtsEvent(handler)` added
  to `ElectronAPI`.
- **Shared types** — added `TtsStatus`, `TtsEvent`, `TtsStartResult`.
- **Renderer hook** — `src/renderer/services/useTts.ts`: manages TTS state
  (`status`, `error`, `provider`, `currentText`).
- **UI** — `SttPanel.tsx` now shows a TTS section below Translation:
  - Status (Off / Starting / Active / Error), Provider row.
  - Speaking text preview (shows current text being spoken).
  - Start TTS / Stop TTS buttons (disabled until translation is active).
- **App.tsx** — owns `useTts` hook; stopping STT also stops TTS.
- **CSS** — added `.tts-section`, `.tts-speaking-box`, `.status-tts-*` styles.
- **.env.example** — `TTS_PROVIDER` (azure/say/mock), `AZURE_TTS_VOICE`.

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds, all bundles present
- Azure SDK reused from existing STT dependency (no new npm packages)
- macOS `say` command zero-dependency, fully offline

## 2026-08-17 — Milestone 4: Azure Translator provider + final-only translation

Added the Azure Translator cloud provider and removed partial translation
(only final STT results are now translated).

- **Azure Translator provider** — `src/main/services/translation/providers/azure.ts`:
  Urdu→English via Azure Translator REST API (POST `/translate?api-version=3.0`).
  Auth: `AZURE_TRANSLATOR_KEY` + `AZURE_TRANSLATOR_REGION` via
  `Ocp-Apim-Subscription-Key` / `Ocp-Apim-Subscription-Region` headers.
  No SDK dependency — uses raw `fetch()`. F0 tier: 2M chars/month free, no
  credit card required.
- **Provider factory updated** — `src/main/services/translation/provider.ts`
  now handles `azure` case (lazy dynamic import), error message updated to
  list all three providers.
- **Removed partial translation** — `TranslationManager` no longer debounces
  or translates partial STT results. Only `isFinal` events trigger translation.
  This saves API calls and matches the design directive (translate final Urdu
  text only). Removed debounce timer, `lastPartial`, and `PARTIAL_DEBOUNCE_MS`.
- **Removed `translation:partial` event** — dropped from `TranslationEvent`
  union type in `packages/shared/index.ts`. Removed `partialEnglish` state from
  `useTranslation` hook, `App.tsx`, `HomeScreen.tsx`, and `SttPanel.tsx`.
- **.env.example** — added `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`,
  optional `AZURE_TRANSLATOR_ENDPOINT`; updated `TRANSLATION_PROVIDER` docs
  with `azure` as default option.

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds, all bundles present
- Azure REST API approach avoids SDK bundling complexity

## 2026-08-17 — Milestone 4: Urdu → English translation + live subtitles (initial implementation)

Implemented the full translation layer: provider abstraction, manager with
debouncing, IPC, preload bridge, renderer hook, and UI wiring.

- **Translation provider abstraction** — `src/main/services/translation/provider.ts`:
  `TranslationProvider` interface (`translate(text): Promise<string>`, `name`)
  with factory `createTranslationProvider()` reading `TRANSLATION_PROVIDER` env.
- **MockTranslationProvider** — `src/main/services/translation/providers/mock.ts`:
  deterministic Urdu→English for common phrases, `[English] <text>` fallback.
  No API key needed; used for development and automated testing.
- **MyMemory provider** — `src/main/services/translation/providers/mymemory.ts`:
  free tier (no signup, no API key, 1000 words/day anonymous), REST call to
  `api.mymemory.translated.net`. Real Urdu→English translation.
- **TranslationManager** — `src/main/services/translation/manager.ts`:
  session lifecycle, debounces partials (800 ms), translates finals immediately,
  emits `TranslationEvent`s to the renderer.
- **Translation IPC** — `src/main/ipc/translation.ts`: `translation:start`,
  `translation:stop`, `translation:event` channels.
- **STT → Translation wiring** — `src/main/ipc/stt.ts` now accepts optional
  `onSttText` callback; `src/main/index.ts` wires it to
  `translationManager.onSttText()`.
- **Preload bridge** — added `startTranslation()`, `stopTranslation()`,
  `onTranslationEvent(handler) → unsubscribe` to `ElectronAPI`.
- **Shared types** — added `TranslationEvent`, `TranslationStatus`,
  `TranslationStartResult`.
- **Renderer hook** — `src/renderer/services/useTranslation.ts`: manages
  translation state (`status`, `partialEnglish`, `finalEnglish`, `error`).
- **UI** — `SttPanel.tsx` now shows English translation below Urdu transcript,
  with translation status/provider rows and Start/Stop Translation buttons.
  Stopping STT also stops translation.
- **CSS** — added `.translation-section`, `.translation-box`,
  `.status-translation-*` styles.
- **.env.example** — documented `TRANSLATION_PROVIDER` (mock / mymemory).

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds, all bundles present
- All 12 files created/modified: `provider.ts`, `providers/mock.ts`,
  `providers/mymemory.ts`, `manager.ts`, `translation.ts`, `stt.ts` (edit),
  `index.ts` (shared, edit), `preload/index.ts` (edit), `useTranslation.ts`,
  `SttPanel.tsx` (edit), `HomeScreen.tsx` (edit), `App.tsx` (edit),
  `App.css` (edit), `.env.example` (edit)

## 2026-08-17 — Milestone 3 quality fix: explicit Urdu, energy gate, normalization

Fixed the core M3 STT quality issue (whisper not reliably transcribing Urdu).

- **Language default changed to `ur`** (`WHISPER_LANGUAGE=ur`). The earlier
  "auto-detect to avoid hallucination" approach was based on a harness bug
  (each `pushAudio` sent the whole file due to `subarray().buffer` returning
  the parent ArrayBuffer, not a copy of the slice). With the corrected
  harness, real Urdu audio with forced `-l ur` is accurate and fast (~1.7 s
  per window on M1); the hallucination trigger is low-energy/noise windows,
  not the language flag.
- **Energy gate** — new constants: `BASE_ENERGY_SKIP_RMS=500` (just above
  quiet-room ambient), `ENERGY_FLOOR_RMS=200`, ratchet on every consecutive
  skip (factor 0.85, floor 200), `RUN_TIMEOUT_MS=12000` (was 30 s). The gate
  drops windows that contain no meaningful speech before Whisper sees them,
  which eliminates the hallucinating decode loop on noise. The threshold only
  ratchets DOWN within a session, never up, so a quiet mic is still heard
  within a few windows.
- **Per-window gain normalization** — `normalizeSamples()` boosts quiet input
  to a target RMS of 6000 (max gain 8×). Verified on real mic captures:
  faint speech (RMS ~600) transcribed noticeably better after boost.
- **Overlap dedup improved** — `stripRepeated` now tolerates a single
  inflection-variant word at the overlap boundary (same first character,
  different suffix — e.g. "ہوں" vs "ہم"), preventing visible duplicates
  across consecutive windows.
- **Mock provider speedup** — `providers/mock.ts`: first partial emitted
  IMMEDIATELY on first `pushAudio` (no 300 ms delay), STEP_MS=250 (was 500),
  full 5-word cycle ~1 s (was ~3 s).
- **Harnessed bug corrected** — `.subarray(...).buffer` → `.subarray(...).slice().buffer`
  in all harnesses (run.js, run-ur.js, run-urdu.js); the earlier "30 s
  pathological hang" on forced-ur English audio was a harness artifact (the
  file was re-sent each window, causing MAX_SAMPLES cap and infinite retry).

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds
- Urugu TTS single sentence: PARTIAL at 3.3 s, FINAL at 4.0 s, no
  hallucination
- Urugu TTS 3 sentences: all 3 transcribed, overlap dedup working
- Real mic capture (quiet, RMS 500-900): all 3 sentences transcribed (gate
  base 500 + normalization)
- Silence-only (30 pushes): zero output (energy gate works)
- English + auto: 4 partials + 1 final, correct, no hangs
- English + forced ur: bounded (12 s timeout), no 30 s hang
- `npx electron .` — app launches and stays alive

## 2026-08-17 — Milestone 3 extension: local offline Whisper STT provider

Added `whisper` as a third `SttProvider` (alongside `azure` default and
`mock`): fully offline speech-to-text via whisper.cpp `whisper-cli` spawned as
a child process in the Electron main process, with the same
renderer → IPC → main pipeline. No changes to the capture/IPC surface.

- **`src/main/services/stt/providers/whisper.ts`** (new) —
  `createWhisperSttProvider()` (`name: "whisper"`). Windowed near-real-time
  decoding: 2 s windows with the previous window's final ~1 s kept as context
  (`OVERLAP_MS`), segments inside the overlap dropped, punctuation-aware
  leading-word dedup (`stripRepeated`), growing phrase emitted as `partial`,
  idle (1.2 s) or stop forces `final`, whisper special tokens (`[BLANK_AUDIO]`,
  …) stripped. Each window is encoded to a temp WAV (`os.tmpdir()`) and
  decoded with `execFile(whisper-cli -m <model> -f <wav> -l <lang> -t 4 -np)`
  with a 30 s timeout. `start()` validates exe + model with actionable errors
  referencing `npm run setup:whisper`. A slow/timed-out window is skipped and
  the session continues; only 3 consecutive failures hard-stop with `error`.
  `stop()` busy-waits for an in-flight decode then forces the final (no
  trailing speech lost).
- **Language default `WHISPER_LANGUAGE=auto`** — measured that forcing `-l ur`
  on English/low-energy windows can trigger whisper.cpp's hallucinating decode
  loop (single 3.5 s window burning 36 CPU-s / ~10 s wall, or worse); whisper's
  auto-detection avoids it (1.7 s) and yields correct output. Forcing
  `WHISPER_LANGUAGE=ur` is available for pure-Urdu speech.
- **Manager/UI wiring** — `manager.ts` lazy-imports the whisper provider and
  `stt:start` returns `{ok:true, provider}`; `packages/shared/index.ts`
  `SttStartResult` gained `provider?: string`; `useStt.ts` exposes the provider
  and `SttPanel.tsx` shows "Provider: Local Whisper" (small debug row in
  `.mic-status-row.provider-row`).
- **Setup** — `scripts/setup-whisper.sh` (new; `npm run setup:whisper`):
  requires arm64 + `cc`/`cmake`/`curl`, clones whisper.cpp into
  `~/.cache/urdu-english-interpreter/`, configures CMake with the M1-safe
  flags needed to avoid the default `-mcpu=native+i8mm` configure hang
  (`-DGGML_NATIVE=OFF -DGGML_CPU_ARM_ARCH=armv8.2-a -DGGML_ACCELERATE=ON
  -DGGML_METAL=OFF`), builds `whisper-cli`, and downloads
  `ggml-${WHISPER_MODEL:-base}.bin`. cmake is a build-time-only tool
  (Homebrew); nothing native is bundled with the app.
- **Env** — `.env.example` documents `WHISPER_EXECUTABLE_PATH`,
  `WHISPER_MODEL_PATH`, `WHISPER_LANGUAGE`, `WHISPER_THREADS`.
- **Debugging findings recorded** — the whisper.cpp CMake configure hang on
  M1 (SMMLA via `-mcpu=native+i8mm` hangs instead of SIGILL); the content-
  and language-dependent pathological decode under forced `-l ur`; temp-file
  capture and standalone reproduction used to isolate each.

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds; `dist/main/index.js` contains the whisper
  provider strings; renderer bundle stays clean of keys/`process.env`
- Whisper harness (real `whisper-cli` + `ggml-base.bin`, jfk.wav PCM):
  `WHISPER_PIPE_AUTO` (4 clean partials + 1 final, no dups, no hang),
  `WHISPER_PIPE_UR` (forced-ur on English audio degrades to skips instead of
  session death), `WHISPER_ERR_PASS` (missing exe/model → actionable
  `start()` errors)
- `npx electron .` — app launches and stays alive with no errors
- Real Urdu transcription (a human speaking Urdu) remains a manual user step;
  see `docs/CURRENT_STATE.md`.

## 2026-08-16 — Milestone 3: speech-to-text (Urdu)

Implemented real-time Urdu speech-to-text using the existing Milestone 2 mic
capture. STT runs in the main process behind a swappable provider abstraction;
the renderer taps the live WebRTC stream, resamples it to 16 kHz mono 16-bit
PCM, and streams it over IPC.

- **Provider abstraction** — `src/main/services/stt/provider.ts`
  (`SttProvider` interface), `manager.ts` (singleton `SttSession` + provider
  selection via `STT_PROVIDER` env), `providers/azure.ts` (Azure Speech SDK,
  `ur-PK`, continuous recognition with interim results via a
  `PushAudioInputStream`), `providers/mock.ts` (keyless dev/test provider
  triggered by real audio chunks). Azure is loaded lazily via dynamic
  `import()` so mock mode never loads the SDK. Missing keys / unknown
  provider → `{ok:false, message}` — never a crash.
- **STT IPC** — `src/main/ipc/stt.ts`: `stt:start` (invoke), `stt:audio-data`
  (fire-and-forget send; payload validated to `ArrayBuffer`/typed arrays),
  `stt:stop` (invoke), `stt:event` broadcasts
  (`started | partial | final | error | stopped`).
- **Main wiring** — `src/main/index.ts` now imports `dotenv/config`, tracks
  the current `BrowserWindow`, and registers `registerSttIpc()`. `.env`
  holds `STT_PROVIDER`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (added to
  `.env.example`); keys never reach the renderer.
- **Preload** — added `startStt()`, `sendSttAudio(chunk)`, `stopStt()`,
  `onSttEvent(handler) → unsubscribe` to `ElectronAPI`.
- **Renderer** — `src/renderer/services/useStt.ts`: taps the M2 capture with
  a `ScriptProcessorNode` through a zero-gain node (no audible feedback),
  resamples to 16 kHz (linear interpolation + carry-over tail), converts to
  Int16 PCM, and maintains `SttStatus` + partial/final transcript + errors.
  New `SttPanel` component (Language: Urdu, Status, Live Transcript with
  partial vs final distinguished, Start/Stop Listening). `App.tsx` wires
  `useMicrophone` + `useStt` (STT start ensures mic capture; stopping either
  stops the other).
- **Shared types** — added `SttStatus`, `SttEvent`, `SttStartResult`;
  extended `ElectronAPI`.
- **Dependencies** — added `dotenv` and
  `microsoft-cognitiveservices-speech-sdk` (esbuild marks the SDK external
  for the main bundle).
- **Docs** — `ARCHITECTURE.md` documents the provider decision (Azure vs
  Google Cloud STT / Deepgram / OpenAI Whisper / Vosk), the 16 kHz mono PCM
  audio format, the streaming approach, security model, cost/free tier, and
  known limitations.

**Provider decision:** Azure Speech chosen over Google Cloud STT
(service-account auth; last-place real-time accuracy in 2026 benchmarks),
Deepgram (newer/less-proven Urdu), OpenAI Whisper (no true streaming), and
Vosk (native dep + Electron ABI rebuild). Azure offers true streaming with
interim results, `ur-PK` Urdu, ~320 ms latency, key + region auth in the
official npm SDK, and a 5 free-hours/month tier. Swappable behind
`SttProvider`.

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds; SDK external in `dist/main/index.js`; renderer
  bundle clean of keys/SDK/`process.env` (grepped)
- Main-process harness: mock lifecycle (`STT_MOCK_PASS`), missing-key +
  unknown-provider errors (`STT_ERR_PASS`)
- Electron UI harness (real preload + real renderer, `STT_PROVIDER=mock`):
  API surface, panel render (Urdu), Start Listening, live partial + final
  transcript, Stop Listening, mic auto-stop, and missing-key error path
  (`STT_MISSING_KEY_UI_PASS`) — all passed, app stays alive throughout
- `npx electron .` — launches and stays alive with no errors
- Real Azure recognition (API key + spoken Urdu) is a manual user step; see
  `docs/CURRENT_STATE.md`.

## 2026-08-16 — Milestone 2 follow-up: auto-refresh microphone device list

Fixed: the device dropdown did not update when a headset/microphone was
plugged in or unplugged while the app was idle.

- `src/renderer/services/useMicrophone.ts` now listens to the browser
  `navigator.mediaDevices` `devicechange` event: the listener is registered
  when the hook initializes and removed on unmount, and every `devicechange`
  fires `refreshDevices()` so the dropdown updates automatically (no Start/Stop
  needed).
- `refreshDevices()` was hardened as part of this:
  - filters out entries with empty `deviceId` (avoids placeholder rows before
    permission is granted),
  - clears a stale "No microphone found." error when devices are present
    again,
  - restores status `error` → `ready` once a device is available again.
- Capture and audio-level behavior unchanged.

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds
- Automated Electron test simulating unplug (one device, then all) and plug
  back in via a stubbed `enumerateDevices` + synthetic `devicechange` events
  through the real renderer: dropdown updated automatically (3 → 2 → none →
  3), status/error recovered, and the Start → Listening → Stop lifecycle still
  works with no page errors (`DEVICECHANGE_PASS`).

## 2026-08-16 — Milestone 2: microphone capture & audio device detection

Implemented the local microphone foundation for macOS.

- **Main process** — new `src/main/services/audio.ts` and
  `src/main/ipc/audio.ts`:
  - `mic:get-permission` → `systemPreferences.getMediaAccessStatus('microphone')`
  - `mic:request-permission` → `systemPreferences.askForMediaAccess('microphone')`
  - No native dependencies were added (Electron's `systemPreferences` API
    covers macOS TCC permission handling).
- **Preload** — added `getMicPermission()` / `requestMicPermission()` to the
  typed bridge (`ElectronAPI`).
- **Renderer** — new `useMicrophone` hook (`src/renderer/services/useMicrophone.ts`)
  plus `MicrophonePanel` and `AudioLevelMeter` components:
  - Enumerates input devices via `navigator.mediaDevices.enumerateDevices()`
    (device IDs match `getUserMedia` exactly).
  - Captures from the selected device via `getUserMedia` and computes a
    real-time level with a WebAudio `AnalyserNode` (time-domain RMS, 0–1).
  - Handles: no device, permission denied, device busy/unavailable, invalid
    selection, `OverconstrainedError` fallback to the default device.
  - `App.tsx` now renders the microphone panel on the Home screen; the
    placeholder "Start Translation" navigation to the live screen was removed
    (Milestone 2 is capture-only). `LiveTranslationScreen`,
    `SubtitleDisplay`, and `StatusBar` remain as Milestone 3 stubs.
- **Shared types** — added `PermissionStatus`; extended `ApplicationStatus`
  with `requesting-permission` and `ready` (replacing the `starting`
  placeholder); extended `ElectronAPI`.
- **UI** — Status (Idle / Requesting permission… / Ready / Listening / Error),
  Permission (Granted / Denied / Not requested / Restricted), 10-block audio
  level meter with percentage, Start/Stop buttons, and actionable error text.

**Architectural decision (documented in `docs/ARCHITECTURE.md`):** capture and
device enumeration live in the sandboxed renderer using Chromium's WebRTC
stack, while macOS permission is orchestrated by the main process. This keeps
the renderer free of Node.js APIs, requires zero native dependencies (no
node-gyp rebuilds against Electron's ABI, no code-signing friction on Apple
Silicon), and guarantees the device IDs shown in the UI are the exact IDs
`getUserMedia` accepts. A native main-process capture module can be added later
if Milestone 3/4 (STT or BlackHole routing) requires it.

Validation:
- `npm run type-check` — 0 errors
- `npm run build` — succeeds
- Automated Electron tests through the real main service, preload, and renderer
  bundle: device detection (3 input devices), capture + RMS level, Start/Stop
  lifecycle in the rendered UI, device selection, and a simulated permission
  denial (graceful error, no crash).
- `npx electron .` — app launches and stays alive with no errors.
- The native macOS permission prompt and "level changes while speaking" were
  not verifiable by automation; they are listed as manual steps for the user.

## 2026-08-16 — Milestone 1 completion (opencode)

Continued from the Gemini session log (removed on 2026-08-16; its content is
captured in this file, `docs/CURRENT_STATE.md`, and `docs/ARCHITECTURE.md`).

Verified from code that the Gemini session's new `src/`/`packages/` layout,
root `package.json`, `tsconfig.json`, and `esbuild.config.js` existed, then
closed the remaining gaps:

- **Removed legacy `backend/`** (FastAPI, faster-whisper, deep-translator
  Python backend) — Python is no longer part of the MVP.
- **Removed legacy `electron/`** directory (JS/JSX app + its own
  `node_modules`). This also fixed `npm run type-check`, which failed with
  TS2459/TS2305 on `electron` imports because the legacy CommonJS
  `electron/main.js` was breaking the `electron` module types.
- **Fixed the build**: `esbuild.config.js` now copies
  `src/renderer/index.html` → `dist/renderer/index.html`. Previously the
  main process loaded a nonexistent `dist/renderer/index.html`.
- **Typed IPC foundation**: added `ElectronAPI` to `packages/shared/index.ts`;
  `src/preload/index.ts` and `src/main/index.ts` now use it; added
  `src/renderer/types/electron.d.ts`; `App.tsx` reads the initial status
  through `window.electron.getAppStatus()` on mount, exercising the secure
  bridge at runtime.
- **Created `.env.example`**.
- **Rewrote `README.md`** to document the Node.js-only architecture and
  Milestone 1 status (was still describing the Python + Electron architecture).
- **Removed obsolete Python-era docs**: `docs/architecture.md`, `docs/api.md`,
  `docs/setup.md`.
- **Established the permanent documentation workflow**:
  - Rewrote `AGENTS.md` (agent instructions + required reading/writing of docs).
  - Created `docs/CURRENT_STATE.md`, `docs/CHANGELOG.md`,
    `docs/ARCHITECTURE.md` (renamed from `docs/architecture.md`).

- **Upgraded Electron `^31.0.0` → `^42.4.0` (installed `42.9.1`)**: the
  Electron 31.7.7 macOS binary is blocked by a 2026 macOS XProtect update
  that flags stale/unsigned Electron builds as malware — it shows
  `"Electron" was not opened because it contains malware`, kills the process
  (SIGKILL), and deletes `Electron.app` from `node_modules`. Electron
  42.x runs cleanly (verified: `npx electron --version` and the smoke test).
  This is a known XProtect false positive, not real malware.

Validation: `npm run type-check` passes, `npm run build` succeeds and produces
`dist/renderer/index.html`, an automated Electron smoke test loads the real
renderer through the real preload bridge and gets `'idle'` via IPC
(`SMOKE_PASS`), and the app launched via `npx electron .` stays alive with no
errors.

Leftovers intentionally not touched: `project_readme.md` (old pre-migration
readme backup), `.aider.*` files, `.DS_Store`.

## 2026-08-16 — Milestone 1 migration work (Gemini session)

Recorded in a Gemini session log (removed on 2026-08-16; content captured in
this file and `docs/CURRENT_STATE.md`). Created the Node.js/TypeScript
architecture:

- Root `package.json`, `tsconfig.json`, `esbuild.config.js`.
- `src/main/index.ts` (Electron main, secure webPreferences).
- `src/preload/index.ts` (contextBridge IPC bridge).
- `src/renderer/` React + TypeScript UI shell (App, HomeScreen,
  LiveTranslationScreen, SubtitleDisplay, StatusBar, App.css).
- `packages/shared/index.ts` shared types.
- Ran `npm install`, `npm run build`.

Left incomplete (finished by the opencode entry above): removing
`backend/`/`electron/`, `dist/renderer/index.html` copy, `.env.example`,
documentation rewrite, and type-check fixing.

## 2026-06 — Original implementation (pre-docs history)

Legacy commits built the original Electron + React (JS) app with a Python
FastAPI backend (`backend/`) for Whisper transcription and translation. Both
were removed during Milestone 1.
