# Architecture

Current and planned architecture for the Real-Time Urdu → English Voice
Interpreter (macOS).

## Current architecture (Milestone 3)

Node.js-only MVP. Electron + React + TypeScript. **Python is not part of the
MVP.**

```text
Electron
   ├── Main Process        src/main/index.ts
   │     ├── BrowserWindow (secure webPreferences)
   │     ├── services/audio.ts     (macOS mic permission via systemPreferences)
   │     ├── services/stt/         (speech-to-text provider abstraction)
   │     │     ├── provider.ts          (SttProvider interface)
   │     │     ├── manager.ts           (session lifecycle + provider selection)
   │     │     └── providers/{azure,mock}.ts
   │     ├── ipc/audio.ts          (mic:get-permission, mic:request-permission)
   │     └── ipc/stt.ts            (stt:start, stt:audio-data, stt:stop, stt:event)
   │
   ├── Preload             src/preload/index.ts
   │     └── contextBridge.exposeInMainWorld('electron', ...)
   │
   └── React Renderer      src/renderer/
         ├── App.tsx (owns useMicrophone + useStt hooks)
         ├── services/useMicrophone.ts (devices, capture, level)
         ├── services/useStt.ts (resample 48k→16k, Int16 PCM → IPC, events)
         ├── components/ (MicrophonePanel, AudioLevelMeter, SttPanel)
         ├── pages/ (HomeScreen; LiveTranslationScreen = M4 stub)
         └── styles/ (App.css)

Shared types: packages/shared/index.ts
Build: esbuild -> dist/  (main, preload, renderer bundle + index.html)
```

### Process roles

| Process | Responsibility |
| --- | --- |
| Main | Window lifecycle, secure config, IPC handlers, macOS microphone permission (via `systemPreferences`), speech-to-text session (Azure Speech SDK) |
| Preload | Only safe bridge between renderer and main; exposes `window.electron` |
| Renderer | React UI + local microphone capture (Chromium WebRTC) + PCM resampling/encoding. Has no direct Node.js / fs / process access |

### Security

- `contextIsolation: true`, `nodeIntegration: false` in `webPreferences`.
- Renderer talks to main only through the typed `ElectronAPI` exposed by the
  preload (`src/renderer/types/electron.d.ts`).
- No `require`, `fs`, `child_process`, or `process` is exposed to the renderer.
- Content-Security-Policy set in `src/renderer/index.html`.

### IPC interface (current)

```ts
interface ElectronAPI {
  getAppStatus: () => Promise<ApplicationStatus>;
  getMicPermission: () => Promise<PermissionStatus>;
  requestMicPermission: () => Promise<PermissionStatus>;
  startStt: () => Promise<SttStartResult>;
  sendSttAudio: (chunk: ArrayBuffer) => void;
  stopStt: () => Promise<void>;
  onSttEvent: (handler: (event: SttEvent) => void) => () => void;
}
```

Channels:

| Channel | Direction | Handler |
| --- | --- | --- |
| `get-app-status` | renderer → main | returns `'idle'` |
| `mic:get-permission` | renderer → main | macOS TCC status (`granted`/`denied`/`not-determined`/`restricted`) |
| `mic:request-permission` | renderer → main | triggers macOS prompt; returns `granted`/`denied` |
| `stt:start` | renderer → main (invoke) | starts a recognition session; returns `{ok, message?}` |
| `stt:audio-data` | renderer → main (send) | streams 16 kHz mono 16-bit PCM chunks to the provider |
| `stt:stop` | renderer → main (invoke) | stops the recognition session |
| `stt:event` | main → renderer | `started` / `partial` / `final` / `error` / `stopped` |

Future channels will be added for start/stop translation and state updates
(see Planned pipeline below).

### Application state

Defined in `packages/shared/index.ts` as `ApplicationStatus`:

```ts
type ApplicationStatus =
  | 'idle' | 'requesting-permission' | 'ready'
  | 'listening' | 'processing' | 'speaking' | 'error';
```

Milestone 3 implements `idle`, `requesting-permission`, `ready`, `listening`,
and `error` in the microphone UI. Speech-to-text has its own `SttStatus`
(`idle | starting | listening | processing | stopping | error`); `processing`
and `speaking` in `ApplicationStatus` remain reserved for translation (M4).

### Microphone pipeline (Milestone 2)

```text
Renderer (Home screen)
   ├── useMicrophone → enumerateDevices()       device list (real labels after permission)
   ├── useMicrophone → getUserMedia({deviceId}) capture from selected device
   ├── WebAudio AnalyserNode                     real-time level (RMS, 0–1)
   └── window.electron.requestMicPermission()    permission via main → macOS TCC prompt
```

**Design decision — capture lives in the sandboxed renderer (Chromium WebRTC),
permission lives in the main process.** Rationale:

- Zero native dependencies — no node-gyp rebuild against Electron's ABI, no
  code-signing/hardened-runtime friction on Apple Silicon. This is the
  simplest reliable approach for input-only capture.
- `enumerateDevices()` IDs are exactly the IDs `getUserMedia()` accepts, so the
  device the user selects is the device that gets captured (no cross-module ID
  mapping).
- macOS microphone access (TCC) is still requested by the main process via
  `systemPreferences.askForMediaAccess('microphone')`, keeping the
  renderer → IPC → main → macOS flow for permission.
- The renderer stays sandboxed: it only uses standard web APIs, never Node.js.
- Milestone 3 STT reuses this renderer capture: the renderer resamples the
  WebRTC audio to 16 kHz mono 16-bit PCM and streams it over IPC to the main
  process (see "Speech-to-text pipeline" below). No native capture module was
  needed. If BlackHole routing (M5) later needs capture in Node, a native
  module (e.g. CoreAudio/PortAudio binding) can be added then, reusing the same
  `mic:*` / `stt:*` IPC surface.

### Speech-to-text pipeline (Milestone 3)

```text
Renderer                                        Main
useMicrophone → getUserMedia stream
   └─ ScriptProcessorNode (taps the live stream,
      via a zero-gain node — no audible feedback)
      └─ resample audioContext.sampleRate → 16 kHz (linear interp)
         └─ Float32 [-1,1] → Int16 PCM
            └─ window.electron.sendSttAudio(chunk)   ──IPC──►  stt:audio-data
                                                              │
                                    sttSession (manager.ts)  │
                                    └─ SttProvider.pushAudio │
                                       Azure PushAudioInputStream
                                       → SpeechRecognizer (ur-PK, continuous)
                                       → recognizing → 'stt:event' partial
                                       → recognized  → 'stt:event' final
                                       → canceled    → 'stt:event' error
```

**Provider selection** — `src/main/services/stt/manager.ts` reads `STT_PROVIDER`
from the environment (loaded by `dotenv` from `.env`):

- `azure` (default) — Azure Speech service, requires `AZURE_SPEECH_KEY` +
  `AZURE_SPEECH_REGION`. The provider is loaded lazily (dynamic `import()`),
  so `mock` mode never loads the ~25 MB SDK.
- `mock` — no API key, emits fake incremental Urdu partial/final text. Used
  for development and automated tests. The mock cycle is triggered by real
  audio chunks arriving over `stt:audio-data`, so it exercises the full
  renderer → IPC → main path.
- anything else / missing Azure keys — `stt:start` returns
  `{ok:false, message}` and the UI shows the error without crashing.

**Provider abstraction** — `provider.ts` defines:

```ts
interface SttProvider {
  readonly name: string;
  start(handlers: SttHandlers): Promise<void>;
  pushAudio(buffer: ArrayBuffer): void;   // 16 kHz mono 16-bit PCM
  stop(): Promise<void>;
}
```

A translation provider in Milestone 4 and future STT providers (Google,
Deepgram, local) plug in behind the same interface; the renderer and IPC
surface never change.

**Audio format** — 16 kHz, mono, 16-bit signed little-endian PCM (the Azure
Speech SDK default input format). The renderer resamples from the
`AudioContext` sample rate (typically 48 kHz) using linear interpolation with a
carry-over tail buffer, and converts Float32 [-1,1] to Int16. Chunk size is
4096 source frames (~85 ms at 48 kHz).

**Streaming approach** — continuous recognition:
`SpeechRecognizer.startContinuousRecognitionAsync()`. `recognizing` events
produce partial (interim) Urdu text; `recognized` events produce the final
utterance; `canceled` events (network, invalid key, provider errors) emit an
`error` event and tear down the session so a later start works. `pushAudio`
writes arrive over a fire-and-forget IPC channel (`ipcRenderer.send`) so the
audio clock is not blocked by IPC round-trips.

**Security model (STT)** — keys never reach the renderer: they live only in
`.env`, loaded into the main process by `dotenv`, and are consumed inside the
Azure provider. The renderer bundle is grepped to confirm it contains no key
names, no SDK references, and no `process.env`. `stt:audio-data` accepts only
`ArrayBuffer`/typed-array payloads (validated in the IPC handler).

**Cost / free tier** — Azure Speech F0 free tier: 5 audio hours/month free
(standard), then ~$1.00–1.40 per audio hour (standard tier). A 1-hour meeting
is therefore free under the monthly free allowance.

**Known limitations**
- `ScriptProcessorNode` (used to tap the mic stream) is deprecated in favor of
  `AudioWorkletNode`; it still works in Chromium/Electron and is fine for the
  MVP, but the deprecation warning appears in the console.
- `AudioContext` sample rates other than 48/44.1 kHz are handled by the
  resampler; 16 kHz output is fixed.
- Partial Urdu text quality depends on the provider; Azure `ur-PK` interim
  results are subject to change until the `recognized` final is emitted.
- Real Azure recognition cannot be verified by automation (needs a user API
  key + spoken Urdu); it is listed as a manual verification step.
- No endpointing: audio keeps streaming until the user presses
  "Stop Listening" (silence-based utterance finalization is handled by the
  provider).

### Build & tooling

- `npm run build` → `esbuild.config.js` bundles:
  - `dist/main/index.js` (platform node, external `electron` and
    `microsoft-cognitiveservices-speech-sdk`; `dotenv` is bundled)
  - `dist/preload/index.js` (platform node, external `electron`)
  - `dist/renderer/bundle.js` + `bundle.css` (platform browser)
  - copies `src/renderer/index.html` → `dist/renderer/index.html`
- `npm run type-check` → `tsc --noEmit` (strict).
- Module alias `@shared/*` → `packages/shared/*` (tsconfig `paths`, honored by
  esbuild).

## Planned pipeline (future milestones — NOT IMPLEMENTED)

```text
Microphone
   ↓
Speech-to-Text (main process / Azure Speech)     ✓ Milestone 3 (Urdu text)
   ↓
Urdu → English Translation (AI provider)           M4
   ↓
Live Subtitles (renderer UI)                       M4
   ↓
Text-to-Speech                                     M5+
   ↓
BlackHole Virtual Microphone (macOS virtual audio driver)  M5+
   ↓
Zoom / Google Meet / Microsoft Teams
```

- Client/incoming audio (from other meeting participants) must NOT be
  translated.
- Main-process services live under `src/main/services/` and IPC handlers under
  `src/main/ipc/` (`audio.ts`, `stt.ts`). A future translation service will
  follow the same pattern (`services/translation/`, `ipc/translation.ts`).
- Future packages: `packages/audio/`, `packages/ai/` for provider-specific
  logic (not created yet; avoid premature abstraction).

## Milestone plan

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Project architecture & Electron foundation | Complete |
| 2 | Microphone capture & audio device detection | Complete |
| 3 | Speech-to-text (Urdu, live partial + final transcript) | Complete |
| 4 | Urdu → English translation + live subtitles | Next |
| 5+ | Text-to-speech, BlackHole routing, meeting integration | Planned |

## Architectural decisions

- **Node.js-only MVP**: Python/FastAPI backend removed (was used for
  faster-whisper STT + deep-translator). Any future STT/translation will be a
  Node.js service in the main process or a managed AI API.
- **TypeScript everywhere**: main, preload, renderer, and shared types.
- **Secure IPC only**: renderer never receives Node.js capabilities.
- **esbuild over heavier bundlers**: keeps the build simple for a local
  desktop MVP.
- **One source of truth**: no parallel implementations of the same feature.
- **Microphone capture in the renderer, permission in the main process**
  (see "Microphone pipeline" above): zero native dependencies, exact
  deviceId matching, and macOS TCC handled via `systemPreferences`.
- **No native audio dependency in Milestone 2**: adding one was avoided because
  it would require rebuilding against Electron's Node ABI and signing
  considerations on Apple Silicon, for no benefit over Chromium's
  `getUserMedia` for input-only capture.
- **Azure Speech as the Milestone 3 STT provider** (see "Speech-to-text
  pipeline" above): true streaming with interim (partial) results, `ur-PK`
  Urdu support, ~320 ms latency (fine for live subtitles), official npm SDK
  that runs in the Electron main process with key + region auth, and a 5
  free-hours/month tier. Alternatives evaluated in 2026: Google Cloud STT
  (streaming + interim, but service-account auth and last-place real-time
  accuracy benchmarks), Deepgram (lower latency, newer/less-proven Urdu),
  OpenAI Whisper (best raw Urdu accuracy but no true streaming — batch/chunked
  only), and local Vosk (native dep, Electron ABI rebuild). The provider
  abstraction lets any of these replace Azure without touching the renderer.
- **`dotenv` for main-process config**: `.env` holds `AZURE_SPEECH_KEY`,
  `AZURE_SPEECH_REGION`, and `STT_PROVIDER`; keys never enter the renderer.
