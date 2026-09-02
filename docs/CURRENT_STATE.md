# Current State

_Last updated: 2026-08-28_

## Open-source readiness

- Application version is now `1.0.0` (first public open-source release).
  Release notes prepared in `docs/releases/v1.0.0.md`; the README presents the
  v1.0.0 release. Tag/Release creation is a separate release step (not yet done).
- Public project documentation, GPL-3.0 licensing, contribution/security/community
  policies, GitHub CI, and issue/PR templates are present.
- Accidentally-tracked local audio recordings (`-.wav`, `-.aiff`) were removed
  from version control and disk. `.gitignore` covers `*.wav`, `*.aiff`,
  `.env` (preserving `.env.example`), logs, and build outputs.
- Confirmed no `.env`, credentials, API keys, recordings, or sensitive logs are
  tracked in the current tree.
- Real Azure credentials, meeting audio, transcripts, and local recordings must
  remain outside the repository.

## Demo deliverables (2026-08-28)

- **Video:** `docs/demo/demo-v1.0.0.mp4` — 48 s, 1920×1080, 30 fps, silent,
  H.264/yuv420p, faststart, 2.0 MB. Seven scenes (title, overview, live
  translation, architecture, routing, highlights, open source) with 0.5 s
  crossfades and slow-zoom motion on screenshot scenes.
- **Screenshots** (real built renderer, deterministic harness, mock provider):
  `docs/images/app-overview.png`, `docs/images/live-translation.png`,
  `docs/images/telemetry.png`.
- **Architecture:** `docs/images/architecture.svg` (source) +
  `docs/images/architecture.png` (3840×2160).
- **Poster:** `docs/images/demo-poster.png` (1920×1080).
- Harness: `demo/` (README inside). Captures are driven through the real
  `window.electron` bridge + synthetic `mediaDevices` tone; full-page capture
  uses vertical strip stitching. Mock provider badges are intentional.
- The MP4 must still be **uploaded to the v1.0.0 Release assets** (manual step;
  `gh` not invoked, no commits/tags/Releases created).

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

## Milestone 10 — Latency Benchmark, Streaming TTS, Production Packaging

Status:
- **Phase 1** — latency benchmark: COMPLETE (2026-08-26)
- **Phase 2** — streaming TTS + digital & acoustic benchmarks: COMPLETE (2026-08-28)
- **Phase 3** — production packaging & macOS distribution: COMPLETE (2026-08-29)

Do NOT start M11.

### What is done (M10 Phase 1)

- **Digital latency benchmark** — 5 synthetic Urdu WAVs (Azure TTS ur-PK-UzmaNeural,
  2–14 words) played through BlackHole input with `PIPELINE_DEBUG=1`.
  Config: Azure STT (ur-IN, segmentation=300ms) + Azure Translator + Azure TTS
  (JennyNeural) + incremental translation (STABLE_MS=200). 5 valid post-warm-up
  utterances, all 5 texts covered.

  | Utterance | Words | First Audio | E2E | STT Final | Translation | TTS | Audio Out |
  |---|---|---|---|---|---|---|---|
  | سلام نمبر | 2 | 1253ms (final) | 2981ms | 178ms | 540ms | 532ms | 1728ms |
  | آج کی میٹنگ بہت اہم ہے | 6 | 2044ms (final) | 4752ms | 956ms | 507ms | 577ms | 2708ms |
  | براہ کرم توجہ سے سنیں اور جواب دیں | 8 | 1866ms (interim) | 5286ms | 1518ms | 365ms | 569ms | 2833ms |
  | ہم اگلے ہفتے نئے منصوبے پر کام شروع کریں گے | 9 | 2280ms (interim) | 6604ms | 2567ms | 89ms | 613ms | 3332ms |
  | کیا آپ مجھے بتا سکتے ہیں کہ ہماری ٹیم کو... | 14 | 1676ms (interim) | 9317ms | 4287ms | 517ms | 562ms | 3947ms |
  | **Average** | | **1844ms** | **5788ms** | **1901ms** | **404ms** | **571ms** | **2910ms** |

  - Final-path First Audio: 2/5 (40%), avg 1649ms
  - Interim-path First Audio: 3/5 (60%), avg 1941ms
  - Interim saves avg 850ms vs final path (STT final avg 2791ms vs firstAudio 1941ms)
  - Inter-stage gaps ≈ 0: `finalToTrans ≈ translationMs`, `transToReady ≈ ttsMs`
  - Renderer buffering 1–4ms steady state (3701ms cold start on first utterance)

- **Acoustic latency benchmark** — 5 valid post-warm-up utterances, all 5 texts
  covered, with feedback isolation (app TTS routed to BlackHole virtual device,
  Urdu test WAVs played through MacBook speakers into the MacBook Air mic).
  Same config as Digital. Every row includes speechStart, STT final, translation,
  TTS, playback start, and playback complete.

  | Utterance | Words | First Audio | E2E | STT Final | Translation | TTS | Audio Out |
  |---|---|---|---|---|---|---|---|
  | سلام نمبر | 2 | 1176ms (final) | 2893ms | 392ms | 323ms | 457ms | 1717ms |
  | آج کی میٹنگ بہت اہم ہے | 6 | 2049ms (final) | 4751ms | 1129ms | 239ms | 677ms | 2702ms |
  | براہ کرم توجہ سے سنیں اور جواب دیں | 8 | 1694ms (interim) | 5247ms | 1544ms | 236ms | 629ms | 2833ms |
  | ہم اگلے ہفتے نئے منصوبے پر کام شروع کریں گے | 9 | 1985ms (interim) | 6095ms | 2059ms | 212ms | 476ms | 3342ms |
  | کیا آپ مجھے بتا سکتے ہیں کہ ہماری ٹیم کو... | 14 | 1657ms (interim) | 9190ms | 4560ms | 223ms | 562ms | 3844ms |
  | **Average** | | **1712ms** | **5635ms** | **1937ms** | **247ms** | **560ms** | **2888ms** |

  - Feedback isolation achieved: no TTS-interrupted outcomes, no invalid clock
    values (previous run had 2 invalid due to TTS feedback through speakers).
  - Interim path fires 3/5 utterances.
  - Acoustic misrecognition note: the 6-word utterance emitted a spurious
    fragment final ("اولائی") before the full "آج کی میٹنگ بہت اہم ہے" final;
    the correct matched final is reported. Room/ambient noise also produced
    occasional extra finals (warm-up and tail fragments), excluded from the
    valid set.

- **Azure streaming TTS feasibility probe** — measured `synthesizing` callback
  timing vs full `speakTextAsync` completion for 5 English texts:

  | Text | Words | First Chunk | Full Completion | Chunks | Savings |
  |---|---|---|---|---|---|
  | Hello. | 1 | 1595ms (cold) | 1664ms | 7 | 69ms |
  | Today's meeting is very important. | 5 | 475ms | 723ms | 11 | 248ms |
  | Please listen attentively and respond. | 5 | 518ms | 761ms | 11 | 243ms |
  | Hamid's week worked on a new project. | 7 | 457ms | 641ms | 14 | 184ms |
  | Can you tell me how much... | 14 | 503ms | 694ms | 15 | 191ms |
  | **Warm avg** (excl. cold) | | **488ms** | **705ms** | **12.8** | **217ms** |

  - First chunk arrives 488ms after request (warm), full audio 705ms
  - Potential per-utterance first-audio savings from streaming: ~217ms
  - First chunk header: first 4 bytes = `00 00 ff ff` (int16 samples, no
    RIFF/WAVE header) — confirmed **raw PCM**, not headered audio. This matches
    `AudioChunk` format (24kHz 16bit mono PCM) exactly; no header stripping needed.
  - Each chunk = 6000 bytes = 125ms of audio
  - Streaming feasibility: **YES** — synthesizing callback fires with usable PCM
    before full completion; chunks arrive faster than playback consumes them
    (64ms interval vs 125ms playback per chunk) → gap-free playback requires
    renderer validation (not yet tested with continuous chunk streaming)
  - **Not yet implemented** — would require modifying `AzureTtsProvider.synthesize()`
    and `TtsManager.onTranslationText()` to support chunked streaming

- **Pipeline telemetry diagnostic additions** — 3 new debug fields in
  `pipeline-telemetry.ts` (gated behind `PIPELINE_DEBUG`):
  - `finalToTrans` — time from STT final to translation complete
  - `transToReady` — time from translation complete to TTS ready
  - `readyToPlay` — time from TTS ready to first playback start
  - These fill the inter-stage gaps that were previously unmeasured

### M10 Phase 2 implementation

- Azure TTS now exposes an additive `synthesizeStream()` capability using the
  SDK `synthesizing` callback. Existing `synthesize()` remains available.
- TTS manager forwards ordered streamed chunks with stable playback IDs and
  `streamStart`/`streamEnd` markers. Preemption aborts the stream and stale
  chunks are not forwarded.
- Renderer queues streamed PCM chunks and reports one playback start and one
  completion per streamed utterance. Legacy providers retain complete-buffer
  playback.
- Telemetry now records `ttsFirstChunkMs` separately from full `ttsMs`.
- Session stop now aborts the in-flight synthesis (`currentSynthesis`) inside
  `TtsManager.stop()`, so a stopped session cancels any active stream, forwards
  no stale chunks, and stops consuming provider resources. Covered by a new
  regression test in `tests/m10-streaming.test.ts`.
- Interim→final streaming attribution fixed: when a final translation replaces
  an active in-flight interim stream for the same utterance, the shared FIFO
  trace is preserved (`preserveInterimTrace`) and adopted by the final so it is
  telemetry-attributed as "completed" — not drained as `tts-interrupted`.
  Real preemption and interim→interim replacement still drain as before.
  Covered by a regression test in `tests/m10-streaming.test.ts`.

### What remains (M10)

- The **Acoustic** 5-utterance before/after benchmark was **completed on
  2026-08-28**. See "M10 Phase 2 benchmark — Acoustic (streaming, verified)"
  below.

### M10 Phase 2 benchmark — Digital (streaming, verified)

5 valid post-warm-up utterances (short / medium-short / medium / long /
very-long), BlackHole input, output to MacBook speakers, PIPELINE_DEBUG=1,
Azure STT ur-IN seg=300ms + Azure Translator + Azure TTS streaming.

| metric | Phase 1 (legacy) | Phase 2 (streaming) | delta |
|---|---|---|---|
| First Audio | 1844ms | 2035ms | +191ms |
| E2E | 5788ms | 5771ms | −17ms |
| STT Final | 1901ms | 1919ms | +18ms |
| Translation | 404ms | 412ms | +8ms |
| TTS full (ttsMs) | 571ms | 664ms | +93ms |
| Audio Out | 2910ms | 2937ms | +27ms |

Streaming measured: time-to-first-chunk (from synthesis start) averaged
**499ms** vs full-synthesis **664ms** → **~165ms/utterance** saved before the
first audible chunk (per-utterance 121–215ms). This matches the ~217ms warm
feasibility estimate (first-chunk saving), but is **not** reflected in the
user-facing `firstAudio` because (a) STT-final latency dominates and (b) the
interim path already provides early audio in most utterances.

- No stale chunks, no gaps, no playback errors observed in the 8 completed
  utterances. Streaming path confirmed live: `[TTS] writeAudio stream bytes`
  chunks forwarded incrementally and played correctly.
- One timing-dependent race was observed: utterance #5 (medium text) was
  recorded `tts-interrupted` when the final translation arrived while the
  interim TTS was still mid-stream; its final synthesis played but was not
  telemetry-attributed. **This was the interim→final streaming attribution
  bug, now FIXED** (see "M10 Phase 2 implementation") with a regression test —
  the final is now attributed as "completed" even when it replaces an active
  interim stream. Re-run of the same medium text had already completed
  cleanly (#8).

**Latency improvement is NOT proven** end-to-end: user-facing `firstAudio`
and `E2E` did not improve (within run-to-run Azure STT variance). Streaming
lowers the time to the first TTS chunk by ~165ms/utterance, which is
dominated by STT-final latency and the interim path.

### M10 Phase 2 benchmark — Acoustic (streaming, verified)

5 valid post-warm-up utterances, physical feedback-isolated run executed
2026-08-28: test WAVs played through the MacBook speakers into the MacBook Air
microphone; app TTS routed to BlackHole (feedback isolation); STT, translation,
and TTS all real (Azure ur-IN seg=300ms + Azure Translator + Azure TTS
streaming, JennyNeural); `PIPELINE_DEBUG=1`. Each row parsed from
`[TELEMETRY] ... completed` lines in the main-process log.

| Utterance | Words | First Audio | E2E | STT Final | Translation | TTS | Audio Out |
|---|---|---|---|---|---|---|---|
| سلام نمبر | 2 | 1020ms (final) | 2783ms | 323ms | 197ms | 589ms | 1763ms |
| آج کی میٹنگ بہت اہم ہے | 6 | 1231ms (final) | 3982ms | 684ms | 234ms | 481ms | 2751ms |
| براہ کرم توجہ سے سنیں اور جواب دیں | 8 | 1540ms (interim) | 4924ms | 1506ms | 107ms | 1079ms | 2832ms |
| ہم اگلے ہفتے نئے منصوبے پر کام شروع کریں گے | 9 | 1780ms (interim) | 6035ms | 2142ms | 109ms | 562ms | 3421ms |
| کیا آپ مجھے بتا سکتے ہیں کہ ہماری ٹیم منصوبے کام شروع کرے گی | 14 | 1306ms (interim) | 6561ms | 2985ms | 118ms | 518ms | 3111ms |
| **Average** | | **1375ms** | **4857ms** | **1528ms** | **153ms** | **646ms** | **2776ms** |

Comparison vs Phase 1 (legacy) and Phase 2 (streaming) digital averages:

| metric | Acoustic Ph1 | Acoustic Ph2 | Δ Ph1→Ph2 | Digital Ph2 |
|---|---|---|---|---|
| First Audio | 1712ms | 1375ms | −337ms | 2035ms |
| E2E | 5635ms | 4857ms | −778ms | 5771ms |
| STT Final | 1937ms | 1528ms | −409ms | 1919ms |
| Translation | 247ms | 153ms | −94ms | 412ms |
| TTS full | 560ms | 646ms | +86ms | 664ms |
| Audio Out | 2888ms | 2776ms | −112ms | 2937ms |

- Interim-path First Audio: 3/5 utterances (60%), matching Phase 1 acoustic.
- No failed utterances, no duplicated finals, no dropped finals; each of the 5
  reached playback via BlackHole(`audioOut` present in all rows).
- Streaming path confirmed live on the acoustic loop: `[TTS] writeAudio stream
  bytes` chunk forwarding observed; the one `interimFirstAudio (pending)` +
  `[TTS] interrupt` sequence (#8) is the expected interim→final replacement
  (incremental translation stabilizing at STABLE_MS=200), with the final still
  telemetry-attributed `completed` — same behavior as Phase 2 digital.
- Methodology notes (transparent deviations from the Phase 1 acoustic run):
  - Test WAVs were amplified +12dB to ensure the MacBook mic captured them
    reliably (default system input volume 27 is too low for TTS-level audio);
    OS input volume raised to 100 for the same reason. Latency is playback
    start-anchored, so level does not affect measured values.
  - The exact 14-word Phase 1 text was unrecoverable (`M10-PHASE1-REPORT.md`
    was never committed); a reconstructed 14-word Urdu sentence was used. STT
    heard it as «...منصوبے کون شروع کریں؟» and translated it accordingly —
    the reconstructed sentence is recorded verbatim in the table for
    reproducibility.
  - The 8-word final was recognized as «براہ کرم توجہ سے سنیں اور جواب۔»
    (final «دیں» dropped by STT); translation remained correct.

### Bottleneck ranking (Digital + Acoustic benchmark, confirmed)

1. **STT final** — 50–70% of first-audio latency (178–4287ms, avg 1901ms)
   - Dominated by Azure endpointing; cannot be reduced without streaming STT
     alternatives or local STT
2. **TTS synthesis** — 20–25% of first-audio latency (532–577ms warm, avg 571ms)
   - Streaming TTS would save ~217ms per utterance
3. **Translation** — 5–15% (89–540ms, avg 404ms)
   - Cold first request adds ~200ms; incremental translation helps
4. **Renderer** — <1% steady state (1–4ms), 3701ms cold start (one-time)

### Expected improvement with streaming TTS

- Measured savings: ~217ms per utterance is a **warm** average (excl. cold first
  request); the first cold request measured 69ms saving.
- 4 warm utterances: `217ms × 4 = 868ms`
- First cold utterance: `69ms`
- Measured five-text session total: approximately `937ms` (from the displayed
  row values: 69 + 248 + 243 + 184 + 191 = 935ms)
- Note: `1085ms` (217ms × 5) is a **hypothetical** five-warm-utterance estimate
  only, not the measured session result.
- Not transformative — STT dominates. Streaming TTS is a minor optimization
  that should be implemented but won't dramatically change the user experience

### M10 Phase 3 — production packaging & macOS distribution (2026-08-29, complete)

- **Packager**: added `electron-builder` `^26.15.3` as a devDependency (only
  packaging system; esbuild unchanged). Scripts `npm run package` (.app + DMG,
  arm64) and `npm run package:dir` (.app only). Outputs to `dist_electron/`
  (git-ignored), build resources in `build/`.
- **Build config** (`package.json` → `build`): appId
  `com.urduenglish.voiceinterpreter`, productName "Urdu English Interpreter",
  `files: ["dist/**/*", "package.json"]` (explicit whitelist — `.env`, `src/`,
  `docs/`, `demo/`, `tests/` are never packaged), mac target `dmg`, hardened
  runtime, category productivity.
- **Entitlements** (`packaging/entitlements.mac.plist`): hardened-runtime JIT
  (`allow-jit`) + microphone (`device.audio-input`); embedded at signing time.
- **Info.plist** via `extendInfo`: `NSMicrophoneUsageDescription` set with a
  clear user-facing string; `NSHumanReadableCopyright`; version derives from
  package.json (`1.0.0`).
- **Secrets**: credentials remain main-process-only. The packaged app never
  ships `.env` or keys (verified: asar contains only `dist/**`,
  `package.json`, production `node_modules`; no secret values). Runtime config
  for the packaged app is loaded from user-owned
  `~/.urdu-english-interpreter/.env` (quiet load) or process environment;
  development `.env` (repo cwd) behavior is unchanged.
- **provider defaults untouched**: STT/Translation/TTS default to `azure`;
  Mock/Whisper/MyMemory/`say` remain selectable via env. `PIPELINE_DEBUG`
  is env-gated (off by default) — no production-forced debug.
- **Whisper / say / BlackHole**: unchanged and packaged-safe. Whisper defaults
  to user-scoped `~/.cache/urdu-english-interpreter/...` (override via
  `WHISPER_EXECUTABLE_PATH` / `WHISPER_MODEL_PATH`); `say` spawns the system
  binary in `/usr/bin`; BlackHole is runtime-detected HAL driver, never bundled.
- **Artifacts** (unsigned): `dist_electron/mac-arm64/Urdu English
  Interpreter.app` (arm64 Mach-O) + `Urdu English
  Interpreter-1.0.0-arm64.dmg` (~119 MB, CRC verified).
- **Clean-install test** (packaged binary, CDP-driven): app launches, renderer
  loads from `app.asar`, full `window.electron` preload API surface present,
  devices enumerate (MacBook mic + BlackHole), mic permission granted for the
  new bundle id, no crash on provider start without keys (graceful "Ready"
  state).
- **Signing**: NOT done — no Apple Developer identity in this environment
  (`0 valid identities`). Configured to skip (`mac.identity: null`); documented
  to re-enable (`CSC_LINK`/`CSC_KEY_PASSWORD`). Entitlements are ready.
- **Notarization**: NOT done — requires Apple Developer credentials
  (`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`). Documented, never
  faked. Marked BLOCKED pending external credentials.
- **Icon**: default Electron icon (no custom `.icns` asset yet) — optional
  polish, not a packaging blocker.

### M10 Phase 4 — Non-technical installation & first-launch onboarding (2026-08-30, complete)

- **Goal**: make the packaged app usable by a non-technical user — DMG →
  Applications → launch → guided setup (microphone → audio output → BlackHole)
  → Start Meeting — with no Terminal, npm, Node, or `.env` required.
- **Setup panel** (`SetupPanel.tsx`) rendered at the top of the home screen,
  above Meeting Mode. Three plain-language steps + a summary line:
  1. *Microphone* — "Allow Microphone" action when permission is not
     determined; "Open System Settings" (macOS microphone privacy pane)
     action when denied/restricted; friendly "no microphone" state.
  2. *Audio output* — shows the selected device + a compact device selector;
     "No audio output available" state when the list is empty.
  3. *BlackHole* — "BlackHole is installed" (ready) or "Install BlackHole
     for meeting apps" with an "Open BlackHole download page" action
     (existential.audio/blackhole). Copy explicitly notes English audio
     still plays locally without BlackHole.
  - Summary: "Ready — press Start Meeting below." when mic + output +
    BlackHole are satisfied; a "Checking your setup…" state while probing.
  - Meet-mode powers the states from **existing** permission/device hooks —
    no new audio, STT, translation, or TTS code paths were added.
- **Pure logic** (`src/renderer/setup/setupState.ts`): `deriveSetupState()`
  maps `{probed, micPermission, hasMicDevice, outputDevices,
  selectedOutputDeviceId, blackholeDetected}` → per-step state
  (`checking | ready | action-required | error`) + overall `ready`, and
  derives BlackHole presence from the main HAL check OR device labels
  (`/blackhole/i`). Deterministic and unit-tested — no browser required.
- **Probe** (`src/renderer/setup/useSetup.ts`): on mount and on
  `devicechange`, refreshes output devices and re-checks BlackHole through
  the main-process HAL detection; derives current step states.
- **Open-external gate**: new small `system:open-external` IPC
  (`src/main/ipc/system.ts`). The main process only opens **exact**
  allow-listed links (`shared/index.ts` `RENDERER_OPEN_EXTERNAL_LINKS`):
  the macOS microphone-privacy settings pane
  (`x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`)
  and the BlackHole download page. Arbitrary or tampered URLs are blocked
  (validated by tests). The renderer can never open a link the main process
  did not enumerate.
- **`useMicrophone`** now also exposes its existing internal
  `requestPermission()` so the setup panel can request the TCC prompt
  explicitly, then re-enumulates outputs on grant.
- **Security/values**: no `.env`, credentials, or secrets introduced; the
  dev Provider architecture, meeting flow, and Start/Stop buttons are
  unchanged. Tests were tightened after the initial allow-list
  implementation was shown to permit path-tampering (prefix match) — final
  implementation is exact-match.
- **Validation**: `npm run type-check` clean; **60/60 tests** (43 existing +
  17 new in `tests/setup-onboarding.test.ts`) covering BlackHole label
  detection, BlackHole detected/missing states, mic permission
  (not-determined/denied/restricted/granted-no-device/unknown), output
  selection + no-output state, overall ready/failure, and the open-external
  allow-list; `npm run build` OK; `npm run package` rebuilt .app + DMG.
- **Packaged-app verification** (CDP-driven): launched the packaged binary —
  renderer from `app.asar`, SetupPanel rendered all three steps Ready on
  this host (mic granted, output detected, BlackHole installed), summary
  "Ready — press Start Meeting below.", `openExternal('https://evil.example.com')`
  rejected with `{ok:false}` from the renderer context, Beautiful-Star
  Meeting/Stop buttons and Microphone/STT panels intact. asar scan confirms
  no `.env` or app-config secrets (only Azure SDK library files whose names
  contain "credential"/"key").
- **Signing/notarization**: still NOT done (no Apple Developer identity).
  Same BLOCKED status as M10 Phase 3.

### M11 UI — shadcn-style design-system revamp (2026-08-31, complete)

- **Scope**: UI/design-system only. STT, Translation, TTS, Audio Output,
  SessionManager, IPC, telemetry, provider logic, audio routing, BlackHole
  detection, and meeting functionality are **unchanged**. `App.tsx` and
  `packages/shared/index.ts` were not modified — every panel's prop contract
  is preserved, so no data-flow wiring changed.
- **Design tokens** (`src/renderer/styles/App.css`, file replaced): `:root`
  CSS-variable tokens — `--bg`, `--panel`, `--surface`, `--border`, `--fg*`,
  semantic colors (`--success/warning/destructive/info/brand`), `--radius-*`
  (4/6/8/10), spacing scale `--sp-*` (4/6/8/12/16), `--font-sans`,
  `--font-urdu`, type scale `--text-xs/sm/base/lg`. Layout helpers
  (`.stack/.row/.split/.grow`), ui primitive classes (`.btn*/.card*/.badge*`
  `.label/.separator*/.select*/.alert*/.progress*/.textbox*`), and
  screen-specific classes (`.setup-*/.meeting-stage/.error-text`). Removed all
  hard-coded hex colors and the 8/10/12px radius inconsistency.
- **Hand-rolled shadcn-style primitives** (`src/renderer/components/ui/`):
  `button.tsx` (variants `default/primary/success/destructive/outline/ghost`,
  sizes `sm/md/lg`), `card.tsx`, `badge.tsx` (+`dot`), `label.tsx`,
  `select.tsx` (`Select/SelectItem`), `separator.tsx` (h/v),
  `alert.tsx` (variants + optional `title`), `progress.tsx`
  (`role=progressbar` + `aria-*`). **Zero new runtime dependencies** — no
  Tailwind/Radix/shadcn-CLI per the minimal-dependency constraint; the
  primitives share the shadcn component API/variants but are plain CSS + TSX
  with CSS-variable tokens.
- **Onboarding redesigned** (`SetupPanel.tsx`): compact "Get Ready" card —
  three rows (Microphone, Audio Output, BlackHole), each with a step icon,
  status Badge (`Ready`/`Action required`/`Checking…`), detail text, and
  inline actions; Separators between rows; a "Ready — Press Start Meeting
  below." banner (success) when all three pass, or a pending banner
  ("Complete the required setup") otherwise. Same `setupState.ts` logic, no
  data changes.
- **Existing panels rebuilt** into compact shadcn-style cards:
  - `HomeScreen.tsx` (rewritten): header (app title + session status Badge
    dot), Get Ready card, Meeting Mode card (4 stage Badges STT/Translate/
    TTS/Audio + large Start/Stop Meeting button), Separator, then Translation,
    Microphone, Text-to-Speech, Audio Output, Speech Recognition cards, then
    Pipeline Performance (dev-gated by `PIPELINE_DEBUG`).
  - `MicrophonePanel.tsx`: device Select, Input Level (Progress bar),
    Start/Stop, warning/destructive Alerts for no-device/denied permission.
  - `SttPanel.tsx` (now Speech Recognition only): Urdu RTL transcript textbox,
    provider + status Badges, Start/Stop Listening — monolith split.
  - `TranslationPanel.tsx`, `TtsPanel.tsx`, `AudioOutputPanel.tsx` (new):
    single-purpose compact cards split out of the old `SttPanel`/home.
  - `AudioLevelMeter.tsx`: uses Progress.
  - `PipelinePanel.tsx`: Card/Badge + inline token styles.
  - Dead-but-consistent legacy kept up to date: `StatusBar.tsx`,
    `SubtitleDisplay.tsx` (fixed missing Card import),
    `LiveTranslationScreen.tsx`.
- **Accessibility**: `role=progressbar`, `role=alert`, `aria-*` on controls,
  keyboard focus states, semantic labels/contrast.
- **Functional regression verified** (CDP against dev + packaged app): all
  selects (setup output, mic, output) populated; Get Ready → "Ready — Press
  Start Meeting below."; Start Meeting → session Active, button → Stop
  Meeting, header Badge → Active; ×3 start/stop cycles all return to Ready.
  Zero console errors/exceptions on reload. App renders from `app.asar`
  identically.

### M11 follow-up — Migrate to real shadcn/ui + Tailwind CSS (2026-09-01, complete)

- **Scope**: UI/design-system migration only. Replaced the previous hand-rolled
  plain-CSS shadcn-style implementation with the actual shadcn/ui + Tailwind
  CSS foundation. The M11 UX structure, component split, compact layout, and
  functional wiring are all preserved — no redesign, no business-logic change
  (STT/Translation/TTS/audio-output providers, SessionManager, IPC, mic
  permission, BlackHole detection, telemetry, meeting start/stop, audio
  routing, `PIPELINE_DEBUG` all untouched; `src/main/*`, `src/preload/*`,
  `packages/shared/index.ts` unchanged).
- **Tailwind integration**: `tailwind.config.js` added (Tailwind v3, class dark
  mode, zinc/neutral theme tokens, `@/` content scan). `esbuild.config.js` adds
  a Tailwind CLI pre-build that compiles `styles/globals.css` →
  `dist/renderer/tailwind.css`, plus a `@/` alias. `index.html` now links
  `tailwind.css` (removed `bundle.css`; App.tsx no longer imports CSS). Main/
  preload/renderer esbuild bundling unchanged — no Vite, no new framework.
- **Real shadcn/ui components** (`src/renderer/components/ui/`): `button.tsx`
  (cva + Radix Slot), `card.tsx`, `badge.tsx` (cva + semantic variants
  success/warning/info/muted + `dot`), `select.tsx` (Radix Select), `label.tsx`
  (Radix Label), `separator.tsx` (Radix Separator), `alert.tsx` (cva +
  AlertTitle/AlertDescription + warning/success), `progress.tsx` (Radix
  Progress), `dropdown-menu.tsx` (Radix DropdownMenu); `lib/utils.ts` `cn()`
  (clsx + tailwind-merge). `@/` alias → `src/renderer` in `tsconfig.json` +
  esbuild.
- **Theme system** (`components/theme-provider.tsx`, `theme-selector.tsx`):
  shadcn CSS-variable token model in `globals.css` (`:root` light + `.dark`
  zinc/neutral palette; semantic background/foreground/card/popover/primary/
  secondary/muted/accent/destructive/border/input/ring; `--radius`). No
  hard-coded colors scattered in components. Theme toggle is the standard shadcn
  mode-toggle: icon Button (Sun/Moon) + DropdownMenu → Light/Dark/System.
  Persists via `localStorage["ui-theme"]`; System follows
  `prefers-color-scheme` reactively via `matchMedia`.
- **Components migrated** to Tailwind utilities (zero custom CSS classes):
  HomeScreen, SetupPanel, MicrophonePanel, SttPanel, TranslationPanel,
  TtsPanel, AudioOutputPanel, PipelinePanel, AudioLevelMeter. Panels now use
  Radix Select (was native `<select>`). Compact/neutral/technical aesthetic
  preserved (h-8 controls, 13px titles, no gradients/glass/excess shadows).
- **Obsolete implementation removed**: deleted `styles/App.css` and the dead
  legacy stubs `StatusBar.tsx`, `SubtitleDisplay.tsx`, `LiveTranslationScreen
  .tsx`; removed `import "./styles/App.css"` from App.tsx. Only app-specific
  CSS remains in `globals.css` (Urdu RTL/Nastaliq transcript `.textbox-urdu`,
  thin scrollbars). One UI system remains.
- **Dependencies added**: Tailwind v3 (dev); `class-variance-authority`,
  `clsx`, `tailwind-merge`, `tailwindcss-animate`, `@radix-ui/react-slot/select/
  label/separator/progress/dropdown-menu`, `lucide-react`. Removed redundant
  root `postcss`/`autoprefixer`. No UI framework, no animation/state libs, no
  build-tooling migration.
- **Accessibility** kept: `role=progressbar`/`role=alert`/`aria-*`,
  focus-visible rings, Radix-managed keyboard/interaction for menus & selects.
- **Validation**: `npm run type-check` clean; `npm test` 60/60; `npm run build`
  OK (outputs `bundle.js` + `tailwind.css` + `index.html`); `npm run
  package:dir` OK and `app.asar` contains all three renderer assets. Packaged
  app CDP-verified (from `app.asar`): all 7 panels render; theme toggle opens
  menu; Light (white) / Dark (zinc-950) / System (follows OS) all switch and
  persist (`ui-theme`) across app restart; mic & output Radix selects enumerate
  devices (incl. BlackHole) and fire onSelect; Start/Stop Meeting 2-cycle
  returns Ready; zero console errors on reload + interaction.

### M11 UI follow-up — ElevenLabs LiveWaveform in Meeting Mode (2026-09-02, complete)

- **Scope**: small UI enhancement only. Added the ElevenLabs `live-waveform`
  component inside the existing Meeting Mode card (header/badges → waveform →
  Start/Stop button → error). No redesign; no business-logic change (STT/
  Translation/TTS/audio-output, SessionManager, IPC, mic capture, providers all
  untouched; no new dependencies added).
- **Component**: vendored the official ElevenLabs `live-waveform` source into
  `src/renderer/components/ui/live-waveform.tsx` (the `@elevenlabs/cli` /
  `shadcn` registry fetches at `ui.elevenlabs.io` were persistently
  rate-limited (HTTP 429), so the source of record
  `github.com/elevenlabs/examples` was used verbatim). An official source
  header notes the origin.
- **Optional renderer-side adapter (available, wired)**: `useMicrophone` now
  derives a 32-band normalized frequency spectrum from its **existing**
  `AnalyserNode` (same capture, no second `getUserMedia`, no second analyser)
  and exposes it as `spectrum`. `App.tsx` passes this to `HomeScreen`, which
  feeds it to the waveform via `audioLevels={meetingActive ? spectrum : []}`.
  In the component, when `audioLevels` is non-empty the animation loop builds
  mirrored static-mode bars from the bands — reproducing the native frequency
  visualization from a single capture. When `audioLevels` is empty (meeting
  stopped) the component falls back to its processing animation. The optional
  `audioLevel?: number` scalar prop remains for a uniform-bars fallback.
- **State mapping** (derived, no duplicate meeting state): `activeListening =
  meetingActive`, `processing = !meetingActive`.
  - Meeting stopped/idle: `active=false`, `processing=true` (animated idle).
  - Meeting started: `active=true`, `processing=false`.
  - Meeting stopped: back to `active=false`, `processing=true`.
- **Audio reactivity**: the waveform is driven by the existing single-capture
  analyser's frequency spectrum (`spectrum` from `useMicrophone`) during an
  active meeting — no second `getUserMedia()`, no second analyser. Idle
  (meeting stopped) shows the animated processing wave.
- **Presentation**: `mode="static"`, `height={80}`, `barWidth={3}`, `barGap={2}`,
  `fadeEdges`, neutral theme-adaptive bar color (inherits computed text color,
  so Light/Dark/System all render correctly), no gradients/glass/excess motion.
- **Files changed**: `src/renderer/components/ui/live-waveform.tsx` (new),
  `src/renderer/pages/HomeScreen.tsx` (card integration),
  `src/renderer/services/useMicrophone.ts` (adds derived `spectrum`),
  `src/renderer/App.tsx` (passes `spectrum`). No config/dep changes.
- **Validation**: `npm run type-check` clean; `npm test` 60/60; `npm run build`
  OK (`dist/renderer/bundle.js` contains the component). Runtime CDP smoke test
  of the built app: zero console errors; Meeting Mode card renders; waveform
  renders with aria-label "Processing audio" (idle state: `active=false`,
  `processing=true`); badges/theme toggle intact.

## What is NOT implemented (intentionally)

Meeting-app integration, authentication, database, backend server, Python.
These are beyond Milestone 7. Milestones 1–7 are all complete. Windows/Linux
packaging is an architectural extension point only (electron-builder is
cross-platform ready; not exercised in M10 Phase 3).

## Next task

M10 Phase 3/4 (production packaging & macOS distribution + non-technical
onboarding), M11 (UI design-system revamp), the M11 follow-up (real
shadcn/ui + Tailwind migration), and the LiveWaveform enhancement are complete
and documented. M10, M11, and the M11 follow-up are fully complete — do not
start M12.
Remaining (manual, outside repo code):
1. **upload `docs/demo/demo-v1.0.0.mp4` as a v1.0.0 Release asset**,
2. **sign/notarize + release the built app** when Apple Developer credentials
   are available (documented in `.env.example`, this file, and README),
3. **manual Google Meet / Zoom / Teams validation** of the packaged `.app`
   using the new SetupPanel guide (mic permission will prompt once for the
   new bundle `com.urduenglish.voiceinterpreter`), and
   confirm live subtitles + BlackHole capture across a real meeting app.

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
src/main/ipc/{audio,audio-output,session,stt,translation,tts,system}.ts
src/preload/index.ts
src/renderer/{App.tsx,index.tsx,index.html}
src/renderer/pages/HomeScreen.tsx
src/renderer/lib/utils.ts
src/renderer/components/ui/{button,card,badge,label,select,separator,alert,progress,dropdown-menu,live-waveform}.tsx
src/renderer/components/{theme-provider,theme-selector}.tsx
src/renderer/components/{MicrophonePanel,AudioLevelMeter,SetupPanel}.tsx
src/renderer/components/{TranslationPanel,TtsPanel,AudioOutputPanel}.tsx
src/renderer/components/{SttPanel,PipelinePanel}.tsx
src/renderer/setup/{setupState,useSetup}.ts
src/renderer/services/{useMicrophone,useSession,useStt,useTranslation,useTts,useAudioOutput}.ts
src/renderer/styles/globals.css
src/renderer/types/electron.d.ts
packages/shared/index.ts
tests/tts-dedup.test.ts
tests/audio-output.test.ts
tests/session.test.ts
tests/setup-onboarding.test.ts
scripts/setup-whisper.sh
esbuild.config.js
tailwind.config.js
packaging/entitlements.mac.plist
package.json   (includes electron-builder "build" config + package scripts)
tsconfig.json
.env.example
```
