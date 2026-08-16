# Architecture

Current and planned architecture for the Real-Time Urdu → English Voice
Interpreter (macOS).

## Current architecture (Milestone 1)

Node.js-only MVP. Electron + React + TypeScript. **Python is not part of the
MVP.**

```text
Electron
   ├── Main Process        src/main/index.ts
   │     ├── BrowserWindow (secure webPreferences)
   │     └── IPC handlers (ipcMain.handle)
   │
   ├── Preload             src/preload/index.ts
   │     └── contextBridge.exposeInMainWorld('electron', ...)
   │
   └── React Renderer      src/renderer/
         ├── App.tsx (state machine + screen switching)
         ├── pages/ (HomeScreen, LiveTranslationScreen)
         ├── components/ (SubtitleDisplay, StatusBar)
         └── styles/ (App.css)

Shared types: packages/shared/index.ts
Build: esbuild -> dist/  (main, preload, renderer bundle + index.html)
```

### Process roles

| Process | Responsibility |
| --- | --- |
| Main | Window lifecycle, secure config, IPC handlers, (future) Node services: audio, AI providers |
| Preload | Only safe bridge between renderer and main; exposes `window.electron` |
| Renderer | Pure React UI. Has no direct Node.js / fs / process access |

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
}
```

Channels:

| Channel | Direction | Handler |
| --- | --- | --- |
| `get-app-status` | renderer → main | returns `'idle'` |

Future channels will be added for device enumeration, start/stop translation,
and state updates (see Planned pipeline below).

### Application state

Defined in `packages/shared/index.ts` as `ApplicationStatus`:

```ts
type ApplicationStatus =
  | 'idle' | 'starting' | 'listening'
  | 'processing' | 'speaking' | 'error';
```

Milestone 1 implements `idle`, `starting`, `error` in the UI; the rest are
reserved for future milestones.

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
- Future main-process services will live under `src/main/services/` and IPC
  handlers under `src/main/ipc/`.
- Future packages: `packages/audio/`, `packages/ai/` for provider-specific
  logic (not created yet; avoid premature abstraction).

## Milestone plan

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Project architecture & Electron foundation | Complete |
| 2 | Microphone capture & audio device detection | Next |
| 3+ | STT, translation, subtitles, TTS, BlackHole routing | Planned |

## Architectural decisions

- **Node.js-only MVP**: Python/FastAPI backend removed (was used for
  faster-whisper STT + deep-translator). Any future STT/translation will be a
  Node.js service in the main process or a managed AI API.
- **TypeScript everywhere**: main, preload, renderer, and shared types.
- **Secure IPC only**: renderer never receives Node.js capabilities.
- **esbuild over heavier bundlers**: keeps the build simple for a local
  desktop MVP.
- **One source of truth**: no parallel implementations of the same feature.
