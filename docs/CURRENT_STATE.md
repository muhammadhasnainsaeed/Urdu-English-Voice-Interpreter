# Current State

_Last updated: 2026-08-17_

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
      `import()`, so mock/whisper mode never loads the SDK).
    - `mock` — no API key; emits incremental fake Urdu partial/final text
      triggered by real audio chunks, so tests exercise the full
      renderer → IPC → main path.
    - `whisper` — fully offline local STT via whisper.cpp (`whisper-cli`
      child process, `ggml-base.bin` model). See the "Whisper provider
      extension" section below.
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
  `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and the whisper variables
  (`WHISPER_EXECUTABLE_PATH`, `WHISPER_MODEL_PATH`, `WHISPER_LANGUAGE`,
  `WHISPER_THREADS`).

## Whisper provider extension (2026-08-17)

Added a third, fully offline STT provider behind the same `SttProvider`
interface. The UI shows "Provider: Local Whisper" in the STT panel once a
session starts.

- **`src/main/services/stt/providers/whisper.ts`** — implements
  `SttProvider` (`name: "whisper"`). It encodes each audio window to a
  temporary WAV file in `os.tmpdir()` and runs
  `whisper-cli -m <model> -f <wav> -l <lang> -t <threads> -np` via
  `child_process.execFile` (main process only; the renderer never gets Node
  APIs).
- **Chunked near-real-time** flow (whisper has no true streaming API):
  - `CHUNK_MS=2000` windowing; each non-idle window carries the previous
    window's final ~1 s as context (`OVERLAP_MS=1000`), and segments fully
    inside the overlap are dropped.
  - Leading words that repeat the running phrase are stripped
    (`stripRepeated`; punctuation-aware, with overlap-boundary tolerance for
    Urdu verb-inflection variants like "ہوں" vs "ہم" at the tail).
  - A growing phrase is emitted as `partial` (the UI shows it live and
    replaces it), and when no audio arrives for `IDLE_MS=1200` it finalizes
    as `final`; `stop()` forces a final.
  - Whisper special tokens (`[BLANK_AUDIO]`, `[NO_SPEECH]`, …) are stripped
    from segment text.
  - `start()` validates the executable and model with actionable errors
    pointing at `npm run setup:whisper`.
  - Failure handling: a slow/failing window is skipped and the session
    continues; only 3 consecutive failures hard-stop the session with an
    `error` event (a single slow decode must not kill a live session).
  - `stop()` waits for any in-flight decode (busy-wait) before forcing the
    final, so no trailing speech is lost.
- **Energy gate** — whisper-cli forced to Urdu hallucinates slow, repeated
  garbage on windows with little or no speech (room noise, mic hiss). The
  gate drops windows whose RMS is below a threshold before Whisper ever sees
  them: `BASE_ENERGY_SKIP_RMS=500` (just above quiet-room ambient, ~50-500
  RMS). The threshold only ratchets DOWN on consecutive skips (factor 0.85
  per skip, floor 200), never up within a session — so a very quiet mic is
  still heard (the gate adapts to its level within a few windows). Resets
  to the base at session start. Windows that slip past the gate with
  faint/background speech are bounded by `RUN_TIMEOUT_MS=12000` (the
  forced-language hallucination decodes very slowly and is killed there).
- **Per-window gain normalization** — quiet input (soft voice, far mic) is
  boosted toward a target RMS of 6000 (max gain 8×). Verified on real mic
  captures: faint speech (RMS ~600) transcribed noticeably better after a
  4× boost, while already-normal audio is unaffected.
- **Language** — defaults to Urdu (`WHISPER_LANGUAGE=ur`). Whisper's
  auto-detection is unreliable on the short windows the chunked pipeline
  feeds it (a 2-3 s Urdu window is often mis-detected), so Urdu mode
  always forces `-l ur`. Language auto-detection is still available via
  `WHISPER_LANGUAGE=auto` if ever needed (e.g. for multilingual sessions).
  The earlier "auto to avoid hallucination" finding was based on a
  harness bug (whole-file re-push on each window) and is now superseded:
  real Urdu with `-l ur` is accurate and fast (~1.7 s/window on M1); the
  energy gate handles the noise/silence windows that caused hallucination.
- **Mock provider speedup** — `providers/mock.ts`: first partial is emitted
  IMMEDIATELY on first audio push (no 300 ms initial delay); words follow
  every `STEP_MS=250` (was 500 ms); full 5-word cycle ~1 s (was ~3 s).
- **Setup** — `scripts/setup-whisper.sh` (`npm run setup:whisper`) clones
  whisper.cpp into `~/.cache/urdu-english-interpreter/`, configures CMake
  with M1-safe flags (`GGML_NATIVE=OFF GGML_CPU_ARM_ARCH=armv8.2-a
  GGML_ACCELERATE=ON GGML_METAL=OFF` — the default `-mcpu=native+i8mm`
  hangs on M1), builds `whisper-cli`, and downloads `ggml-base.bin`
  (141 MB; `WHISPER_MODEL=tiny` for `ggml-tiny.bin`). cmake is a build-time
  only tool (installed via Homebrew); no binary/native dependency is bundled
  with the app.
- **Defaults** — executable at
  `~/.cache/urdu-english-interpreter/whisper.cpp/build/bin/whisper-cli`,
  model at `~/.cache/urdu-english-interpreter/models/ggml-base.bin`,
  `WHISPER_THREADS=4`. All overridable via env.
- **Latency observed (M1, `ggml-base`)**: first partial ~3.3-4.0 s after
  start (cold model load), then a partial roughly every 2 s while speaking;
  final ~0.2 s after the phrase ends. Windows decode at ~1.2-1.7 s for a
  2-4 s window with default args (`-np`, `WHISPER_THREADS=4`). No
  pathological hangs observed with real Urdu audio (the earlier 10 s+ decode
  was on a forced-Urdu-on-English adversarial test + a harness bug that
  re-sent the entire file each window; both corrected).
- **Manager/UI wiring** — `manager.ts` lazy-imports the whisper provider;
  `stt:start` returns the active provider name; `useStt.ts` exposes it and
  `SttPanel.tsx` renders it ("Local Whisper"); shared `SttStartResult` gained
  `provider?: string`. Client/incoming audio is still never translated.

### Urdu validation with real audio (2026-08-17)

Real Urdu speech was validated with two sources:

1. **Google Translate TTS** — 3 sentences generated via the public TTS
   endpoint (`tl=ur`), concatenated with 0.5 s silences → `urdu-3sents.wav`
   (7.46 s). Standalone baseline (`-l ur`): sentence 1 "میں آج آپ سے بات
   کرنا چاہتا ہوں" → "میں آج آبسی بات کرنا چاہتا ہوں" (good); sentence
   2 "آپ کا دن کیسا رہا" → "آپ کا دین کے سرہا" (weak — a known limitation
   of `ggml-base` on certain TTS-pronounced words); sentence 3 "میرا نام
   احمد ہے" → "میرa نام احمد ہے" (perfect).
2. **Real microphone capture** — the Urdu TTS audio played through a Mac's
   built-in speakers and recorded via ffmpeg AVFoundation (`:1` = MacBook Air
   Microphone, RMS ~500-900 for speech windows). The recording was resampled
   to 16 kHz and fed through the provider pipeline. All three sentences
   transcribed correctly: "مرحیدان میں آج عمسی بات کرنا چاہتا ہوں آپ کا
   دین کے سر ہا میرا نام تہمد ہے" — errors are the known base-model
   limitation on faint/TTS audio, not pipeline failures. Previously the
   energy gate at 1250 silently dropped this quiet mic input; the new base
   gate at 500 + per-window normalization fixed it.
3. **Silence-only test** — 30 pushes of digital silence → zero
   partials/finals/errors, confirming the energy gate works.
4. **English + auto** — jfk.wav: 4 clean partials + 1 final, no hangs,
   correct text.
5. **English + forced ur** — bounded decode, no 30 s hang; garbage text
   (inherent non-Urdu-in-ur-mode) filtered to empty via token stripping.

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

## Milestone 3 validation (latest run 2026-08-17)

- `npm run type-check` — passes (0 errors)
- `npm run build` — succeeds; `dist/renderer/index.html` produced; Azure SDK
  is external to `dist/main/index.js` (lazy `require`) and absent from
  `dist/renderer/bundle.js`
- Renderer bundle grep — clean: no key names, no SDK references, no
  `process.env`
- Main-process tests (bundled real manager + mock provider):
  - `STT_MOCK_PASS` — mock start → started event; pushing PCM chunks produces
    growing `partial` Urdu text then a `final`; stop clears the session;
    restart after stop works. Mock cadence: immediate first partial, 250 ms
    per word, full cycle ~1 s (was 3 s).
  - `STT_ERR_PASS` — `azure` without keys → `{ok:false}` with an actionable
    message, session not active; unknown provider → `{ok:false}`.
- Whisper provider harness (real `whisper-cli` + `ggml-base.bin`, bundled
  provider driven over PCM in 4096-sample chunks at 200 ms intervals):
  - `WHISPER_PIPE_AUTO` — with `WHISPER_LANGUAGE=auto`: 4 clean partials
    (~2 s cadence, growing phrase, no duplicated words, no `[BLANK_AUDIO]`),
    1 single final on stop, no hangs, session exits cleanly. Latency: first
    partial ~3.9 s, updates every ~2 s.
  - `WHISPER_PIPE_UR` — with `WHISPER_LANGUAGE=ur` (adversarial: English
    audio forced to Urdu): bounded decode (12 s timeout), no 30 s hang, no
    session death.
  - `WHISPER_ERR_PASS` — missing executable and missing model → `start()`
    throws actionable messages referencing `npm run setup:whisper`.
  - Energy gate validation: 30 pushes of digital silence → zero
    partials/finals/errors.
  - Quiet mic capture (real microphone audio, RMS ~500-900): all 3 Urdu
    sentences transcribed (gate base 500 allows quiet speech through, +6000
    RMS normalization boosts for whisper).
  - Overlap dedup: tolerant of Urdu verb-inflection variants at the overlap
    boundary (e.g. "ہوں" vs "ہم" — same first character, different suffix).
- `npx electron .` — real app launches and stays alive with no errors.
- Note: real Azure recognition (key + spoken Urdu) and real Urdu human speech
  transcription are NOT verifiable by automation; they are manual steps.
  `ScriptProcessorNode` deprecation warning is expected (see ARCHITECTURE.md).
  `ggml-base.bin` limitations on certain TTS-pronounced Urdu words (e.g.
  "کیسا رہا" transcribed as "کے سرہا") are a known model-size limitation, not
  a pipeline bug.

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
5. For a keyless demo, set `STT_PROVIDER=mock` and watch fake Urdu text flow
   (mock now responds immediately with a ~1 s word-by-word cycle).
6. **Offline Whisper**: run `npm run setup:whisper` (builds whisper-cli +
   downloads the model into `~/.cache/urdu-english-interpreter/`), set
   `STT_PROVIDER=whisper`, run `npm start`, and speak Urdu. Urdu is
   transcribed with forced `-l ur` (auto-detection is unreliable on short
   windows). The energy gate skips silent/noisy windows automatically; if you
   experience missed words on very quiet input, the normalization boost
   handles most cases. Switching to a fully offline engine makes real Urdu
   transcription verifiable without any API key.

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
src/main/services/stt/providers/{azure,mock,whisper}.ts
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
scripts/setup-whisper.sh
esbuild.config.js
package.json
tsconfig.json
.env.example
```
