# Current State

_Last updated: 2026-08-16_

## Milestone 1 — Project Architecture & Electron Foundation

Status: **COMPLETE** (verified from code on 2026-08-16)

## Milestone 2 — Microphone Capture & Audio Device Detection

Status: **COMPLETE** (verified on 2026-08-16)

## What is done (Milestone 2)

- **Main process audio service** — `src/main/services/audio.ts`:
  - `getMicrophonePermission()` — reads macOS TCC status via Electron's
    `systemPreferences.getMediaAccessStatus('microphone')` (no native
    dependencies).
  - `requestMicrophonePermission()` — triggers the macOS prompt via
    `systemPreferences.askForMediaAccess('microphone')`.
- **IPC handlers** — `src/main/ipc/audio.ts` registers
  `mic:get-permission` and `mic:request-permission` (registered in
  `src/main/index.ts` on `app.whenReady`).
- **Preload bridge** — `src/preload/index.ts` now also exposes
  `getMicPermission()` and `requestMicPermission()`.
- **Renderer capture hook** — `src/renderer/services/useMicrophone.ts`:
  permission lifecycle, device enumeration, `getUserMedia` capture from the
  selected device, WebAudio `AnalyserNode` → real-time audio level (0–1),
  graceful start/stop, and error mapping (`NotAllowedError`,
  `NotFoundError`, `NotReadableError`, `OverconstrainedError`).
  The device list auto-refreshes via the `navigator.mediaDevices`
  `devicechange` event (listener added on init, removed on unmount), so the
  dropdown updates when headsets/microphones are plugged in or unplugged while
  the app is idle. `refreshDevices()` also clears stale errors and recovers
  status `error` → `ready` when devices become available again.
- **UI** — `MicrophonePanel` (`src/renderer/components/MicrophonePanel.tsx`):
  device `<select>`, Status, Permission, Audio Level meter, Start/Stop buttons,
  error messages, and a System Settings hint when permission is denied.
  `AudioLevelMeter` renders a 10-block bar + percentage.
- **Home screen** — `src/renderer/pages/HomeScreen.tsx` now hosts the real
  microphone panel; `App.tsx` renders it and owns the `useMicrophone` hook.
  The "Start Translation" placeholder flow was removed — Milestone 2 focuses on
  local capture only.
- **Shared types** — added `PermissionStatus`
  (`granted | denied | not-determined | restricted | unknown`); extended
  `ApplicationStatus` with `requesting-permission` and `ready` (replaced the
  `starting` placeholder); added the two permission calls to `ElectronAPI`.

## Milestone 2 states

- `idle`, `requesting-permission`, `ready`, `listening`, `error` are used by
  the microphone UI.
- `processing`, `speaking` remain defined in `packages/shared/index.ts` and
  are reserved for Milestone 3 (translation).

## Validation (Milestone 2, latest run)

- `npm run type-check` — passes (0 errors)
- `npm run build` — succeeds; `dist/renderer/index.html` is produced
- Automated Electron smoke tests (real main service + real preload + real
  renderer bundle):
  - `SMOKE_PASS` — `window.electron` exposes all 3 methods; `getAppStatus` →
    `'idle'`; `getMicPermission` → `'granted'` on this machine; 3 input devices
    detected ("Default – External Microphone (Built-in)", "External
    Microphone (Built-in)", "MacBook Air Microphone (Built-in)");
    `getUserMedia` + `AnalyserNode` capture returned a real (non-zero) RMS.
  - `UI_CAPTURE_PASS` — clicking Start in the real rendered UI → button becomes
    "Stop", status "Listening", level meter live (reacted to ambient audio,
    e.g. 100%); clicking Stop → back to "Start", level 0%.
  - `UI_SELECT_PASS` — device selection in the real UI switches the selected
    device (e.g. to "MacBook Air Microphone (Built-in)").
  - `UI_DENY_PASS` — with a simulated denied permission: UI shows
    "Permission: Denied" + hint, Start stays clickable, clicking it shows the
    denial error message, status → "error", and the app keeps running (no
    crash, no page errors).
  - `DEVICECHANGE_PASS` — simulated unplug (one device, then all) and plug
    back in via a stubbed `enumerateDevices` + synthetic `devicechange` events:
    the dropdown auto-updated (3 → 2 → none → 3), status recovered from
    `error` to `ready`, stale errors cleared, and Start → Listening → Stop
    still worked with no page errors.
- `npx electron .` — real app launches and stays alive with no errors.
- Note: permission was already granted on this machine, so the real macOS
  prompt was not triggered during automated testing. The prompt + speaking
  test require the user to run the app manually (see below).

## Manual verification still needed (by the user)

Automation cannot click the native macOS permission dialog or speak into a
microphone. Please run `npm start` and confirm:

1. Microphones are detected and shown.
2. A microphone can be selected.
3. macOS permission is requested when needed (on this machine it is already
   granted).
4. Start begins capture (Status → Listening).
5. Audio level changes while speaking.
6. Stop ends capture.
7. Permission denial does not crash the app.

## What is NOT implemented (intentionally)

Speech-to-text, Urdu → English translation, AI APIs, text-to-speech, BlackHole,
virtual microphone output, meeting-app integration, database, authentication,
backend server, Python. These belong to Milestone 3+.

## Next task

Milestone 3 — Speech-to-Text and translation pipeline (STT from the captured
microphone audio, Urdu → English translation, live subtitles UI; the existing
`LiveTranslationScreen` / `SubtitleDisplay` / `StatusBar` components are the
starting point).

## Files at a glance

```text
src/main/index.ts
src/main/services/audio.ts
src/main/ipc/audio.ts
src/preload/index.ts
src/renderer/{App.tsx,index.tsx,index.html}
src/renderer/pages/HomeScreen.tsx
src/renderer/components/{MicrophonePanel,AudioLevelMeter}.tsx
src/renderer/components/{SubtitleDisplay,StatusBar}.tsx        (M3 stubs)
src/renderer/pages/LiveTranslationScreen.tsx                   (M3 stub)
src/renderer/services/useMicrophone.ts
src/renderer/styles/App.css
src/renderer/types/electron.d.ts
packages/shared/index.ts
esbuild.config.js
package.json
tsconfig.json
.env.example
```
