# Changelog

Every agent working on this repository MUST append a dated entry describing
their changes after finishing work.

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
