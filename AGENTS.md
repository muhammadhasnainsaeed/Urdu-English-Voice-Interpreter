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
- BlackHole (future)
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

### Milestone 4 — Urdu → English Translation (NEXT)

Not started. Do not begin until Milestone 3 is verified and the user says
to continue.

## Do NOT implement yet

- Translation API
- Text-to-speech
- BlackHole
- Real-time audio streaming (to a virtual output)
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
npm start            # build + launch Electron
npm run watch        # esbuild watch mode
```

## Validation Checklist

Before declaring a milestone complete:

- `npm run type-check` passes with no errors
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
