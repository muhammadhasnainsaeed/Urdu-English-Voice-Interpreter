# Historical Design Draft (Superseded)

> **Status: ARCHIVED / OUTDATED — for historical reference only.**
>
> This file is the original pre-migration design draft for the Urdu → English
> Voice Interpreter (written before the project was built). It does **not**
> describe the implemented architecture and must not be used as setup or
> contribution guidance.
>
> The current, accurate documentation is [`README.md`](README.md) and the
> documents under [`docs/`](docs/). In particular:
>
> - The implementation is a **Node.js / Electron / React / TypeScript** app.
>   There is **no Python backend**, FastAPI server, or WebSocket service.
> - Speech-to-text uses **Azure Speech** (production) with Whisper and Mock as
>   optional local/testing alternatives.
> - Translation uses **Azure Translator** (production) with MyMemory and Mock
>   alternatives.
> - Text-to-speech uses **Azure streaming TTS** (production) with macOS `say`
>   and Mock alternatives.
> - Audio routing is provided by **BlackHole** on macOS.
>
> This draft is retained only to preserve the original design context documented
> in `docs/CHANGELOG.md`. Nothing in this file reflects current behavior.

---

## Original draft (as preserved)

The original MVP proposal described a desktop Electron application that
translates a user's spoken Urdu into English during live meetings (Zoom, Google
Meet, Microsoft Teams), displaying live Urdu and English text and sending the
translated English voice to the meeting through a virtual microphone.

Planned phases in the original draft:

1. Translation subtitles MVP (microphone → whisper → translation → subtitles).
2. Voice generation (TTS integration and audio playback).
3. Virtual microphone integration (BlackHole routing into Zoom/Meet/Teams).
4. Production improvements (streaming, low latency, speaker profiles, history,
   export, multiple languages).

The original draft proposed a Python 3.11+/FastAPI backend with Whisper, Google
Translate, ElevenLabs/OpenAI TTS, and WebSockets. **None of those backend
components are part of the implemented MVP.** The implemented architecture is
entirely in-process Node.js/TypeScript within the Electron app, using Azure
services for the production path (see `README.md` and `docs/ARCHITECTURE.md`).

## Future work referenced by the original draft

Some ideas from the draft remain future/optional work and are not implemented:

- English → Urdu (reverse direction) and additional language pairs.
- Voice cloning and AI meeting summaries.
- Cloud / SaaS / team deployments.
- Additional providers (e.g., Deepgram or OpenAI) — currently optional/future.