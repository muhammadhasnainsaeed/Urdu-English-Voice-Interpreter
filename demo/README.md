# Demo harness

What the demo shows is **documentation, not a coded simulation** of the product:
every screenshot is captured from the real built renderer
(`dist/renderer/index.html`). The harness makes the pipeline deterministic by
substituting a scripted `window.electron` preload contract (faked completed
onboarding, mock providers, scripted transcripts) and a synthetic microphone
tone — exactly the interfaces the production app exposes.

Deterministic screenshots are captured from the real UI so the release video,
README, and architecture diagram are honest: no fake product claims, no
generated footage. The demo build drives the mock providers, so the pipeline
runs with no cloud credentials.

## Scenes

| Frame | File (in `docs/images/` unless noted) | Contents |
| ----- | ------------------------------------- | -------- |
| Overview | `app-overview.png` | Home — Meeting Mode ready (Stopped), Speech to Text idle |
| Live translation | `live-translation.png` | Active meeting, live Urdu transcript + English translation |
| Telemetry | `telemetry.png` | Settings → Performance: `PIPELINE_DEBUG` per-utterance timings |
| Architecture | `architecture.png` (from `architecture.svg`) | Full pipeline diagram |
| Video | `docs/demo/demo-v1.0.0.mp4` | 48 s, 1920×1080, 30 fps, silent |
| Social launch video | `docs/demo/launch-v1.1.0-social.mp4` | 28 s, 1080×1920, 30 fps, caption-led and silent |
| Social poster | `docs/images/launch-v1.1.0-social-poster.png` | Opening frame for the social launch video |

## How it works

- `demo/preload/demo-preload.js` implements the full `window.electron` bridge
  plus `navigator.mediaDevices` shims. Scenario timing drives the current
  Home/Settings UI (via stable `data-demo` anchors on the card components):
  starts a meeting, streams Urdu partials/finals and their English
  translations, and opens Settings → Performance for the telemetry panel.
- `demo/src/capture-app.mjs` loads the real `dist/renderer/index.html` with a
  `?demo=overview|live|telemetry` query, waits for `window.__demo.ready`, and
  captures the full page (macOS clamps window height, so pages are captured in
  vertical strips and stitched), then crops to `docs/images/`. It verifies each
  region's rendered text before saving.
- `demo/src/compose-frames.mjs` composites seven 1152×648 CSS frames
  from the screenshots + architecture PNG into `demo/out/` (scaled to
  1920×1080 in the next step).
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

## Regenerate the vertical social launch video

The social launch video uses the same app assets by default. To feature a fresh
set of locally captured release screenshots without adding the source captures
to the repository, provide their directory at render time:

```bash
SOCIAL_SCREENSHOTS_DIR="/path/to/screenshots" npm run demo:launch-video
```

When present, the composer uses these names: `Screenshot 2026-10-08 at
11.33.32 AM.png` (setup), `Screenshot 2026-10-08 at 11.33.47 AM.png` (live
translation), and `Screenshot 2026-10-08 at 11.34.25 AM.png` (captions). If
they are unavailable, it falls back to the committed demo screenshots. The
output is silent so platform-native music can be added at posting time.
