# Project Instructions

These instructions apply to every coding agent working in this repository.
Read this file and the documents it references **before** changing anything.

## Permanent Documentation Workflow (READ FIRST)

Every agent MUST read these files before working:

1. `AGENTS.md` (this file)
2. `docs/CURRENT_STATE.md` — exact current progress and the next task
3. `docs/CHANGELOG.md` — history of every agent's changes
4. `docs/ARCHITECTURE.md` — current and planned architecture

Every agent MUST update these files after finishing work:

- `docs/CURRENT_STATE.md` — reflect what changed and what is next
- `docs/CHANGELOG.md` — append a dated entry describing the changes

If an architectural decision changes, update `docs/ARCHITECTURE.md` too.

Never assume previous agent work is complete. Verify it from the code.

## Project

Real-Time Urdu → English Voice Interpreter for macOS.

User speaks Urdu during Zoom, Google Meet, Microsoft Teams, etc.

Flow:

```text
Microphone
→ Speech-to-Text
→ Urdu → English Translation
→ Live Subtitles
→ Text-to-Speech
→ BlackHole Virtual Microphone
→ Meeting App
```

Client/incoming audio must NOT be translated.

## Tech Stack

- Electron
- React
- TypeScript
- Node.js
- macOS
- BlackHole (user-installed, detected at runtime)
- AI APIs (future)

Python is NOT part of the target MVP architecture.

## Repository Layout

```text
src/
  main/        Electron main process (window, secure config, IPC handlers)
  preload/     contextBridge preload script (secure IPC bridge)
  renderer/    React UI (App, pages, components, styles, types)
packages/
  shared/      Shared TypeScript types used across processes
dist/          Build output (esbuild; git-ignored)
docs/          Architecture, current state, changelog, agent session logs
```

## Milestones

### Milestone 1 — Project Architecture & Electron Foundation

Complete. See `docs/CURRENT_STATE.md`.

### Milestone 2 — Microphone Capture & Audio Device Detection

Complete. See `docs/CURRENT_STATE.md`.

### Milestone 3 — Speech-to-Text (Urdu)

Complete. See `docs/CURRENT_STATE.md`.

### Milestone 4 — Urdu → English Translation

Complete. See `docs/CURRENT_STATE.md`.

### Milestone 5 — Text-to-Speech

Complete. See `docs/CURRENT_STATE.md`.

### Milestone 6 — Audio Output Routing / Virtual Microphone

Complete. See `docs/CURRENT_STATE.md`.

### Milestone 7 — Production Meeting Pipeline & End-to-End Hardening

Complete. See `docs/CURRENT_STATE.md`.

## Do NOT implement yet

- Virtual microphone routing (actual meeting-app integration beyond device targeting)
- Meeting-app integration
- Authentication
- Database
- Backend server
- Python

## Development Rules

1. Inspect the existing repository first.
2. Inspect `package.json`, `src/`, `packages/`, and the docs.
3. Check what the current milestone already covers.
4. Only implement missing work.
5. Do not rewrite working code unnecessarily.
6. Preserve existing conventions and existing file structure.
7. Run the project after changes.
8. Fix build/type errors.
9. Update `docs/CURRENT_STATE.md` and `docs/CHANGELOG.md` after working.
10. Stop when the current milestone is complete; do not start the next one.

## Commands

```bash
npm install       # install dependencies
npm run type-check   # TypeScript type checking (tsc --noEmit)
npm run build        # esbuild bundle (main, preload, renderer) -> dist/
npm run dev          # watch build + Electron with auto-restart on main/preload changes
npm start            # build + launch Electron
npm run watch        # esbuild watch mode (rebuild only, no relaunch)
npm run lint         # ESLint (flat config, eslint.config.mjs)
npm run lint:fix     # ESLint with --fix
npm run format       # Prettier --write (src, scripts, tests, packages, configs)
npm run format:check # Prettier --check (CI-friendly)
npm run package      # production .app + DMG (electron-builder, macOS arm64) -> dist_electron/
npm run package:dir  # production .app only (no DMG)
```

Production packaging secrets rule: NEVER add `.env` or credentials to
`package.json` `build.files`; runtime config for packaged builds comes from
`~/.urdu-english-interpreter/.env` or process environment.

## Validation Checklist

Before declaring a milestone complete:

- `npm run type-check` passes with no errors
- `npm run lint` passes with no errors
- `npm run build` succeeds and `dist/renderer/index.html` exists
- The Electron app launches and the React UI loads
- The preload bridge (`window.electron`) is exercised without errors
- No Node.js APIs are exposed directly to the renderer
- Documentation is updated

## Reporting

After finishing work, report:

- What was completed (verified from the code)
- What remains in the current milestone
- Validation results
- Files created / modified / removed
