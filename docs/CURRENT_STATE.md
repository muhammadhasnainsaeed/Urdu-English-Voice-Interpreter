# Current State

_Last updated: 2026-08-16_

## Milestone 1 — Project Architecture & Electron Foundation

Status: **COMPLETE** (verified from code on 2026-08-16)

## What is done

- **Electron main process** — `src/main/index.ts` creates the window with
  secure `webPreferences` (`contextIsolation: true`, `nodeIntegration: false`),
  registers the `get-app-status` IPC handler, and handles macOS window lifecycle.
- **Secure preload bridge** — `src/preload/index.ts` exposes a typed
  `window.electron` API (`getAppStatus`) via `contextBridge`. No Node.js APIs
  are exposed to the renderer.
- **React + TypeScript renderer** — `src/renderer/`:
  - `App.tsx` manages application state and screen switching (Home ↔ Live).
  - `pages/HomeScreen.tsx` — microphone/output placeholders, language pills,
    Start Translation button.
  - `pages/LiveTranslationScreen.tsx` — Urdu/English subtitle boxes + status bar
    + Stop button.
  - `components/SubtitleDisplay.tsx`, `components/StatusBar.tsx`.
  - `styles/App.css` — dark theme UI shell.
  - `types/electron.d.ts` — global `Window.electron` type declaration.
- **Shared types** — `packages/shared/index.ts` defines `TranslationResult`,
  `AudioDevice`, `ApplicationStatus`, `TranslationState`, `AIProviderState`,
  and `ElectronAPI`.
- **Build system** — `esbuild.config.js` bundles main, preload, and renderer
  into `dist/` and copies `index.html` to `dist/renderer/index.html`.
- **Config** — root `package.json`, `tsconfig.json`, `.env.example`.
- **Electron toolchain** — Electron `^42.4.0` (installed `42.9.1`). Upgraded
  from `^31.0.0` because a 2026 macOS XProtect update flags the Electron 31.7.7
  macOS binary as malware (a known false positive affecting stale/unsigned
  Electron builds) and deletes it from `node_modules`. See `docs/CHANGELOG.md`.
- **Python removed** — legacy `backend/` (FastAPI, faster-whisper,
  deep-translator) and legacy `electron/` directories were deleted. The MVP is
  now Node.js-only with a single source of truth.

## Functional application states (Milestone 1)

- `idle`, `starting`, `error` are functional in the UI.
- `listening`, `processing`, `speaking` are defined in
  `packages/shared/index.ts` but reserved for future milestones.

## Validation (latest run)

- `npm run type-check` — passes (0 errors)
- `npm run build` — succeeds; `dist/renderer/index.html` is produced
- Automated Electron smoke test — loads the built renderer through the real
  preload bridge and calls `window.electron.getAppStatus()` → `'idle'`
  (`SMOKE_PASS`)
- `npx electron .` — app launches and stays alive with no errors
- Note: the Electron 31.7.7 binary was blocked by macOS XProtect; upgraded to
  Electron 42.9.1 which runs cleanly

## What is NOT implemented (intentionally)

Microphone capture, audio device detection, speech-to-text, translation,
text-to-speech, BlackHole, AI providers, authentication, database, backend
server, Python. These belong to Milestone 2+.

## Next task

Milestone 2 — Microphone Capture & Audio Device Detection.

- **Do not begin** until the user confirms Milestone 1 is accepted.
- After starting it, capture the expected work here (device enumeration via
  macOS, permission handling, exposing devices through IPC, device selection
  in the Home screen).

## Files at a glance

```text
src/main/index.ts
src/preload/index.ts
src/renderer/{App.tsx,index.tsx,index.html}
src/renderer/pages/{HomeScreen,LiveTranslationScreen}.tsx
src/renderer/components/{SubtitleDisplay,StatusBar}.tsx
src/renderer/styles/App.css
src/renderer/types/electron.d.ts
packages/shared/index.ts
esbuild.config.js
package.json
tsconfig.json
.env.example
```
