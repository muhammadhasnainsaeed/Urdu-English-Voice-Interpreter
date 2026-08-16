# Real-Time Urdu → English Voice Interpreter (macOS)

A macOS desktop app that listens to Urdu speech and shows a live
English translation — designed to run alongside Zoom, Google Meet, and
Microsoft Teams.

**Current milestone: Milestone 1 — Project Architecture & Electron
Foundation.** This milestone builds the application shell only. No audio
capture, speech-to-text, or translation is implemented yet.

## Architecture

Electron + React + TypeScript + Node.js. Python is **not** part of the
MVP architecture.

```text
Electron
   ├── Main Process      src/main/    (window, secure config, IPC)
   ├── Preload           src/preload/ (secure IPC bridge via contextBridge)
   └── Renderer          src/renderer/(React UI shell)
Shared types             packages/shared/
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full current
and planned architecture.

## Getting started

Requires Node.js 18+ and npm.

```bash
npm install
npm run type-check   # TypeScript checks
npm run build        # Bundle main, preload, renderer into dist/
npm start            # Build + launch the Electron app
```

`npm run watch` rebuilds on file changes.

## What's implemented (Milestone 1)

- Electron main process with secure `webPreferences`
  (`contextIsolation: true`, `nodeIntegration: false`)
- Secure preload bridge (`window.electron`) with typed IPC
- React + TypeScript application shell (Home and Live Translation
  screens)
- Start / Stop UI controls and basic application state
  (`idle`, `starting`, `error`; `listening`, `processing`, `speaking`
  reserved for future use)
- Shared TypeScript types for the future translation pipeline
- `esbuild` bundling for main, preload, and renderer

## NOT implemented yet (future milestones)

- Microphone capture / audio device detection (Milestone 2)
- Speech-to-text
- Urdu → English translation
- Live subtitle streaming
- Text-to-speech
- BlackHole virtual microphone routing
- AI provider integration
- Authentication / database / backend server

## Future pipeline

```text
Microphone
   ↓
Speech-to-Text
   ↓
Urdu → English Translation
   ↓
Live Subtitles
   ↓
Text-to-Speech
   ↓
BlackHole (virtual microphone)
   ↓
Zoom / Google Meet / Microsoft Teams
```

All pipeline stages above are NOT IMPLEMENTED.

## Documentation

- `AGENTS.md` — instructions for every coding agent working on this repo
- `docs/CURRENT_STATE.md` — exact current progress and the next task
- `docs/CHANGELOG.md` — history of changes by every agent
- `docs/ARCHITECTURE.md` — current and planned architecture

Every agent must read `AGENTS.md`, `docs/CURRENT_STATE.md`,
`docs/CHANGELOG.md`, and `docs/ARCHITECTURE.md` before working, and
update the first two after finishing.
