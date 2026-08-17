# Changelog

Every agent working on this repository MUST append a dated entry describing
their changes after finishing work.

## 2026-08-17 — Milestone 6: Audio output routing (initial implementation)

Refactored TTS to decouple synthesis from audio routing, added
AudioOutputProvider abstraction, and wired renderer-based playback.

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
