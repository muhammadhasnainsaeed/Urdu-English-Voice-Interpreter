# Demo harness

What the demo shows is **documentation, not a coded simulation** of the product:
every screenshot is captured from the real built renderer
(`dist/renderer/index.html`). The harness makes the pipeline deterministic by
substituting a scripted `window.electron` preload contract and a synthetic
microphone tone — exactly the interfaces the production app exposes.

Deterministic screenshots are captured from the real UI so the release video,
README, and architecture diagram are honest: no fake product claims, no
generated footage. Provider badges correctly read **Mock (dev)** where the demo
build drives mock providers.

## Scenes

| Frame | File (in `docs/images/` unless noted) | Contents |
| ----- | ------------------------------------- | -------- |
| Overview | `app-overview.png` | Meeting mode ready, mic Ready/Granted |
| Live translation | `live-translation.png` | Active meeting, level meter, Urdu → English output |
| Telemetry | `telemetry.png` | `PIPELINE_DEBUG` per-utterance timings |
| Architecture | `architecture.png` (from `architecture.svg`) | Full pipeline diagram |
| Video | `docs/demo/demo-v1.0.0.mp4` | 48 s, 1920×1080, 30 fps, silent |

## How it works

- `demo/preload/demo-preload.js` implements the full `window.electron` bridge
  plus `navigator.mediaDevices` shims. Scenario timing drives meeting mode,
  status pills, a real analyser level meter, translation events, and mock TTS
  playback events.
- `demo/src/capture-app.mjs` loads the real `dist/renderer/index.html` with a
  `?demo=overview|live|telemetry` query, waits for `window.__demo.ready`, and
  captures the full page (macOS clamps window height, so pages are captured in
  vertical strips and stitched), then crops to `docs/images/`. It verifies each
  region's rendered text before saving.
- `demo/src/compose-frames.mjs` composites seven 2304×1296 broadcast frames
  from the screenshots + architecture PNG into `demo/out/`.
- `demo/video/build-video.sh` builds slow-zoom scene clips (ffmpeg `zoompan`)
  and crossfades them into the final MP4.
- `demo/src/render-svg.mjs` rasterizes `docs/images/architecture.svg` to a
  crisp 3840×2160 PNG without qlmanage's letterboxing.

## Regenerate everything

All commands run from the **repository root**:

```bash
# 1. rebuild the real renderer first
npm run build

# 2. capture the three screenshots
./node_modules/.bin/electron demo/src/capture-app.mjs

# 3. render the architecture diagram, then the frames, then the video
./node_modules/.bin/electron demo/src/render-svg.mjs docs/images/architecture.svg docs/images/architecture.png
./node_modules/.bin/electron demo/src/compose-frames.mjs
bash demo/video/build-video.sh
```

Outputs: `demo/out/` (git-ignored intermediates) and the committed assets in
`docs/images/` + `docs/demo/`.