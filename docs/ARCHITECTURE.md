# Architecture

Current and planned architecture for the Real-Time Urdu → English Voice
Interpreter (macOS).

## Current architecture (Milestone 2)

Node.js-only MVP. Electron + React + TypeScript. **Python is not part of the
MVP.**

```text
Electron
   ├── Main Process        src/main/index.ts
   │     ├── BrowserWindow (secure webPreferences)
   │     ├── services/audio.ts     (macOS mic permission via systemPreferences)
   │     └── ipc/audio.ts          (mic:get-permission, mic:request-permission)
   │
   ├── Preload             src/preload/index.ts
   │     └── contextBridge.exposeInMainWorld('electron', ...)
   │
   └── React Renderer      src/renderer/
         ├── App.tsx (owns useMicrophone hook)
         ├── services/useMicrophone.ts (devices, capture, level)
         ├── components/ (MicrophonePanel, AudioLevelMeter)
         ├── pages/ (HomeScreen; LiveTranslationScreen = M3 stub)
         └── styles/ (App.css)

Shared types: packages/shared/index.ts
Build: esbuild -> dist/  (main, preload, renderer bundle + index.html)
```

### Process roles

| Process | Responsibility |
| --- | --- |
| Main | Window lifecycle, secure config, IPC handlers, macOS microphone permission (via `systemPreferences`), (future) Node services: AI providers |
| Preload | Only safe bridge between renderer and main; exposes `window.electron` |
| Renderer | React UI + local microphone capture (Chromium WebRTC). Has no direct Node.js / fs / process access |

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
}
```

Channels:

| Channel | Direction | Handler |
| --- | --- | --- |
| `get-app-status` | renderer → main | returns `'idle'` |
| `mic:get-permission` | renderer → main | macOS TCC status (`granted`/`denied`/`not-determined`/`restricted`) |
| `mic:request-permission` | renderer → main | triggers macOS prompt; returns `granted`/`denied` |

Future channels will be added for start/stop translation and state updates
(see Planned pipeline below).

### Application state

Defined in `packages/shared/index.ts` as `ApplicationStatus`:

```ts
type ApplicationStatus =
  | 'idle' | 'requesting-permission' | 'ready'
  | 'listening' | 'processing' | 'speaking' | 'error';
```

Milestone 2 implements `idle`, `requesting-permission`, `ready`, `listening`,
and `error` in the microphone UI; `processing` and `speaking` are reserved for
Milestone 3.

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
- If Milestone 3/4 (STT in the main process or BlackHole routing) needs capture
  in Node, a native module (e.g. CoreAudio/PortAudio binding) can be added then,
  reusing the same `mic:*` IPC surface.

### Build & tooling

- `npm run build` → `esbuild.config.js` bundles:
  - `dist/main/index.js` (platform node, external `electron`)
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
Speech-to-Text (main process / AI provider)
   ↓
Urdu → English Translation (AI provider)
   ↓
Live Subtitles (renderer UI)
   ↓
Text-to-Speech
   ↓
BlackHole Virtual Microphone (macOS virtual audio driver)
   ↓
Zoom / Google Meet / Microsoft Teams
```

- Client/incoming audio (from other meeting participants) must NOT be
  translated.
- Main-process services live under `src/main/services/` and IPC handlers under
  `src/main/ipc/` (e.g. `audio.ts`). Future services (STT, translation) will
  follow the same pattern.
- Future packages: `packages/audio/`, `packages/ai/` for provider-specific
  logic (not created yet; avoid premature abstraction).

## Milestone plan

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Project architecture & Electron foundation | Complete |
| 2 | Microphone capture & audio device detection | Complete |
| 3 | Speech-to-text & Urdu → English translation pipeline | Next |
| 4+ | Live subtitles, TTS, BlackHole routing | Planned |

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
