# Contributing

Thanks for helping improve Urdu-English Voice Interpreter.

## Before you start

- Read `README.md`, `AGENTS.md`, and the relevant files under `docs/`.
- Check existing issues before opening a new one.
- Never include API keys, recordings, meeting content, or personal data in a
  commit or issue.

## Development

1. Fork the repository and create a focused branch.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and use Mock providers unless real Azure
   credentials are required for the change.
4. Make the smallest change that solves the problem.
5. Run `npm run type-check`, `npm run build`, and `npm test`.
6. Update documentation when behavior, configuration, or architecture changes.
7. Open a pull request describing the change and validation performed.

## Pull requests

Pull requests should have a clear title, focused scope, tests for changed
behavior, and no generated build output or secrets. Changes affecting audio
routing, provider behavior, or credentials should include manual test notes.

## Architecture rules

Preserve provider abstractions, the secure preload boundary, BlackHole device
routing, and the Node.js-only MVP architecture. Do not add Python, backend
services, authentication, or meeting-app integrations without a prior design
discussion.
