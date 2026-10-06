# Meeting Round-Trip Validation Protocol

_Last updated: 2026-10-05_

This document defines how to verify the interpreter end-to-end in a real
meeting app (Google Meet / Zoom / Microsoft Teams). It is the manual
counterpart to `npm run preflight` (automated environment checks) and covers
the one validation class that cannot be proven by unit tests: live audio
round-trip through BlackHole into a meeting.

## Scope

**In scope**

- Microphone → STT (Urdu) → translation (English) → live subtitles
- Floating captions overlay during a live meeting
- TTS → selected output device → BlackHole → meeting-app microphone
- Session start/stop stability for a multi-minute call

**Out of scope** (covered elsewhere)

- Provider configuration and build checks → `npm run preflight`
- Latency micro-benchmarks → `docs/CURRENT_STATE.md` (M10 telemetry results)
- Code signing / notarization → release checklist

## Prerequisites

Run before every validation session:

```bash
npm run type-check   # must be clean
npm test             # must be 0 failures
npm run build        # produces dist/ (required by preflight)
npm run preflight    # environment + config + BlackHole checks
```

`npm run preflight` must end with:

```text
Ready for the round-trip protocol (0 warning(s)). See docs/meeting-validation.md.
```

Warnings (`TTS_PROVIDER=mock`, BlackHole missing) are acceptable only for
development dry-runs — never for a meeting validation.

Additional manual prerequisites:

1. **BlackHole installed** (2ch is enough) and visible in
   System Settings → Sound → Output.
2. **Microphone permission** granted to the app (prompted on first use, or
   System Settings → Privacy & Security → Microphone).
3. **A meeting app** you can join alone (a second participant or a second
   account on the same call is ideal so you can hear the result).
4. **Headphones** for the observer, so TTS output does not re-enter the mic
   (feedback loop) unless you are deliberately testing loopback behavior.

## Environment matrix

Run the full protocol against each configuration you ship:

| # | Build            | STT / Translation / TTS providers | Purpose                            |
| - | ---------------- | --------------------------------- | ---------------------------------- |
| 1 | `npm run dev`    | repo `.env` (azure / azure / say)  | development regression             |
| 2 | packaged `.app`  | `~/.urdu-english-interpreter/.env` | production config path regression  |
| 3 | packaged `.app`  | `STT_PROVIDER=mock` (others real)  | UI routing when STT is unavailable |

## Protocol

### Phase 1 — Setup

1. Launch the app. Confirm the startup log shows the expected providers
   (packaged builds print `[CONFIG] speech-to-text provider: …`,
   `[CONFIG] translation provider: …`, `[CONFIG] text-to-speech provider: …`).
2. Open **Settings**:
   - **Microphone**: pick the physical mic you will speak into.
   - **Audio output**: select **BlackHole 2ch**.
   - **Voice**: run **Test Voice** once — you should hear it (in headphones,
     or check it lands on BlackHole's meter).
3. Join the meeting alone (or with a second account). In the meeting app's
   microphone settings, select **BlackHole 2ch** as the input device.
   - The meeting app must NOT receive your raw microphone — only BlackHole.

### Phase 2 — Round trip

4. Back in the interpreter, click **Start Meeting**. Expect:
   - Session badge → **Active**, all four stages (STT, Translation, TTS,
     Audio) → active.
   - STT card → **Listening**.
5. Click the **captions overlay** button in the Home header. The floating
   overlay window appears, stays on top, and does not steal focus from the
   meeting app.
6. Speak a short Urdu sentence at a normal pace, e.g.
   «آپ کی آواز سنائی دے رہی ہے».
7. Record observations against the pass criteria table below.
8. Repeat with 4–6 varied sentences (short phrase, full sentence, a number,
   a name, one deliberately long sentence).
9. From the second participant (or the meeting app's own playback), confirm
   the interpreted English speech arrives as audio.
10. Leave the session running ≥ 5 minutes with intermittent speech to check
    for drift, echo, queue buildup, or stage flapping.
11. Click **Stop Meeting**. Expect all stages → idle, no error toasts, and
    no residual audio (check `ps aux | grep -i say` for orphaned `say`
    processes — there should be none).

### Phase 3 — Overlay & transcript checks (during/after Phase 2)

12. Overlay behavior while meeting is active:
    - Appears above the meeting window; drags by its header strip.
    - Shows the latest Urdu finals + English translations, auto-scrolling.
    - Shows live partial Urdu while you speak.
    - Green status dot while listening, gray when idle.
    - Close (×) button hides it; the Home header button reflects the state.
    - Opening/closing it never interrupts STT, TTS, or the meeting.
13. After stopping: use **Export transcript** (header ⬇) → `.txt` and
    `.json`. Verify paired Urdu/English lines and a sensible file name in
    the chosen location.
14. **Clear transcript** empties the visible history; export then disables.

### Phase 4 — Regression probes

15. Device persistence: quit and relaunch the app. The previously selected
    microphone and output device must be preselected in Settings.
16. Focus safety: while the overlay is open, click into the meeting app —
    it must receive focus normally (the overlay is non-focusable).
17. Error paths (one at a time, then restore):
    - Stop BlackHole's selection mid-session → audio stage error toast,
      session reports error, other stages stop cleanly.
    - Kill network mid-session (airplane mode) → STT/translation errors
      surface via toast; Stop Meeting still succeeds.

## Pass criteria

| Stage          | Pass if                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| STT            | Urdu finals appear ≤ ~1.5 s after speech ends; partials stream while talking |
| Translation    | English appears below/alongside the Urdu final within ~1 s of the final |
| TTS            | English speech is audible from BlackHole within ~2 s of the translation |
| Meeting leg    | Second participant hears the interpreted speech; raw mic is NOT heard    |
| Overlay        | Updates in lockstep with Home; never steals focus; always on top         |
| Session        | Start/stop are clean — no stuck stages, no orphaned processes            |
| Stability      | ≥ 5 min run with no stage flapping, echo, or growing latency            |
| Export         | `.txt`/`.json` contain the paired utterances from the session           |

**Recorded latency** (per sentence, optional but recommended):

| Sentence | Speech end → Urdu final | Urdu final → English | English → first audio out |
| -------- | ----------------------- | -------------------- | ------------------------- |
|          |                         |                      |                           |

## Failure triage

| Symptom                                     | Likely cause                                          | First check                                              |
| ------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| No Urdu text at all                         | STT not configured / wrong mic selected               | `npm run preflight`; STT card message; Settings mic list |
| Urdu text but `[English] …` output          | Translation provider is `mock`                        | `[CONFIG] translation provider` log; preflight           |
| Captions fine, no audible TTS               | Output not routed to BlackHole / TTS mock             | Settings → Audio output; `[CONFIG] text-to-speech` log   |
| Second participant hears nothing            | Meeting app input is not BlackHole                    | Meeting app microphone settings                          |
| Second participant hears your raw voice     | Meeting app still on the physical mic                 | Same as above                                            |
| Echo/feedback                               | TTS playing to speakers while mic is live             | Use headphones for the observer                          |
| Overlay does not appear                     | Window creation failed                               | Console logs; restart app; check desktop space           |
| Overlay opens but stays empty               | Events not broadcast (regression in window routing)   | Verify with Home captions simultaneously                  |
| Stage stuck on "Starting…"                  | Session start failed mid-pipeline                     | Toast message; app logs; restart app                      |
| Latency grows over time                     | Queue buildup (TTS/translation backpressure)          | `PIPELINE_DEBUG=1` Performance panel                      |

## Evidence to capture

- Preflight output (screenshot or paste).
- Provider logs (`[CONFIG] …` lines) for packaged runs.
- The latency table above (at least 3 sentences).
- Screenshots: Home during speech, overlay during speech, export result.
- Any failing stage's toast text verbatim.

## Frequency

- Before every release (alongside `npm run type-check`, `npm test`,
  `npm run lint`, `npm run build`).
- After any change to audio capture, routing, TTS playback, window
  management, or provider configuration.
