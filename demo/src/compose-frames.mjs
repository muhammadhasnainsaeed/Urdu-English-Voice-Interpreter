/*
 * Compose the 7 demo-video frames from the real product screenshots.
 *
 * Usage:  <electron> src/compose-frames.mjs
 *
 * Each scene is designed for a 1152x648 CSS viewport and captured at
 * 2x device scale so every frame is a broadcast-ready 2304x1296 PNG.
 * Frames land in <root>/demo/out/ together with frames.json metadata
 * consumed by demo/video/build-video.sh.
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'demo', 'out');

app.commandLine.appendSwitch('force-device-scale-factor', '2');

const VIEW_W = 1152;
const VIEW_H = 648;
const CSS = `file://${path.join(ROOT, 'demo', 'css', 'frames.css')}`;

const imgDataUri = (rel) => {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  return `data:image/png;base64,${buf.toString('base64')}`;
};

const OVERVIEW = imgDataUri('docs/images/app-overview.png');
const LIVE = imgDataUri('docs/images/live-translation.png');
const ARCH = imgDataUri('docs/images/architecture.png');

const scenes = [
  { id: 'title', duration: 5 },
  { id: 'overview', duration: 9, zoom: 0.00022 },
  { id: 'live', duration: 10, zoom: 0.0002 },
  { id: 'architecture', duration: 9, zoom: 0.00022 },
  { id: 'routing', duration: 7, zoom: 0.00028 },
  { id: 'highlights', duration: 6 },
  { id: 'opensource', duration: 5 },
];

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="${CSS}" />
</head>
<body>
  <section class="scene" id="sc-title">
    <div class="grid-bg"></div>
    <div class="title-center">
      <div class="logo-mark">Ur</div>
      <div class="title-kicker">Real-Time Voice Interpreter</div>
      <h1 class="headline">Urdu <span class="arrow">→</span> English</h1>
      <div class="tagline">Speak Urdu on macOS meetings and get live English subtitles and translated speech.</div>
      <div class="title-badges">
        <span class="badge">v1.0.0</span>
        <span class="badge green">Open Source</span>
        <span class="badge">macOS</span>
      </div>
    </div>
  </section>

  <section class="scene" id="sc-overview">
    <div class="grid-bg"></div>
    <div class="product-stage">
      <div class="win-chrome" style="width:340px">
        <div class="bar">
          <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
          <span class="title">Urdu → English Interpreter · Meeting mode</span>
        </div>
        <img src="${OVERVIEW}" width="340" alt="Overview" />
      </div>
    </div>
    <div class="caption">
      <h2>Listen in Urdu</h2>
      <p>Real-time speech recognition with English subtitles while you talk — meeting mode keeps a live status pill.</p>
    </div>
  </section>

  <section class="scene" id="sc-live">
    <div class="grid-bg"></div>
    <div class="product-stage">
      <div class="win-chrome" style="width:168px">
        <div class="bar">
          <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
          <span class="title">Live translation</span>
        </div>
        <img src="${LIVE}" width="168" alt="Live translation" />
      </div>
    </div>
    <div class="caption">
      <h2>Translate as you speak</h2>
      <p>Streaming translation and early text-to-speech. This demo build runs mock providers; production backends plug in behind the same interfaces.</p>
    </div>
  </section>

  <section class="scene" id="sc-architecture">
    <div class="grid-bg"></div>
    <img src="${ARCH}" style="position:absolute; left:50%; top:22px; transform:translateX(-50%); height:506px" alt="Architecture" />
    <div class="caption">
      <h2>Architecture</h2>
      <p>Secure Electron core: sandboxed React UI, contextBridge IPC, and main-process STT / translation / TTS / audio-output providers.</p>
    </div>
  </section>

  <section class="scene" id="sc-routing">
    <div class="grid-bg"></div>
    <div class="routing-wrap routing">
      <h1>Route translated audio to meetings</h1>
      <p class="sub">Interpreter audio targets BlackHole — the virtual microphone meeting apps receive.</p>
      <div class="flow">
        <div class="fbox"><div class="emo">🎤</div><div class="name">Microphone</div><div class="note">Urdu speech in</div></div>
        <div class="farrow">→</div>
        <div class="fbox accent"><div class="emo">💬</div><div class="name">Interpreter</div><div class="note">Transcribes, translates, speaks</div></div>
        <div class="farrow">→</div>
        <div class="fbox blackhole"><div class="emo">🕳</div><div class="name">BlackHole</div><div class="note">Virtual microphone (2.0)</div></div>
        <div class="farrow">→</div>
        <div class="fbox"><div class="emo">🎧</div><div class="name">Meet · Zoom · Teams</div><div class="note">English audio out</div></div>
      </div>
    </div>
  </section>

  <section class="scene" id="sc-highlights">
    <div class="grid-bg"></div>
    <div>
      <div class="hl-head">
        <h1>What works today</h1>
        <p>Milestones 1–10: capture, STT, translation, TTS, routing, meeting mode, telemetry.</p>
      </div>
      <div class="cards">
        <div class="card">
          <h3><span class="accent">4-stage</span> meeting pipeline</h3>
          <p>Busy → listening → translating → speaking → audio-output with live latency chips.</p>
        </div>
        <div class="card">
          <h3>Streaming TTS · <span class="stat">first chunk ≈ 0.5 s</span></h3>
          <p>Audio starts while synthesis still runs; preempts on new speech and dedups repeats.</p>
        </div>
        <div class="card">
          <h3>Measured latency · <span class="stat">first audio ≈ 2.0 s</span></h3>
          <p>End-to-end ≈ 5.8 s on the Azure digital benchmark (BlackHole input), 2026.</p>
        </div>
        <div class="card">
          <h3><span class="accent">Pluggable</span> providers</h3>
          <p>Azure Speech · whisper.cpp · Azure Translator · MyMemory · Azure TTS · macOS say · mock.</p>
        </div>
      </div>
      <div class="footnote">PIPELINE_DEBUG telemetry panel shows per-utterance timings.</div>
    </div>
  </section>

  <section class="scene oss" id="sc-opensource">
    <div class="grid-bg"></div>
    <div class="title-center">
      <div class="badge green">v1.0.0</div>
      <div class="big">Open Source</div>
      <div class="repo">github.com/muhammadhasnainsaeed/Urdu-English-Voice-Interpreter</div>
      <div class="stack">Electron · React · TypeScript</div>
    </div>
  </section>
</body>
</html>`;

fs.mkdirSync(OUT, { recursive: true });
const htmlPath = path.join(OUT, 'frames.html');
fs.writeFileSync(htmlPath, html);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: VIEW_W,
    height: VIEW_H,
    useContentSize: true,
    show: false,
    backgroundColor: '#07080b',
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.setBackgroundThrottling(false);
  await win.loadFile(htmlPath);
  await new Promise((r) => setTimeout(r, 500));

  const out = [];
  for (const [idx, scene] of scenes.entries()) {
    await win.webContents.executeJavaScript(
      `(() => {
        document.querySelectorAll('.scene').forEach((s) => s.classList.remove('active'));
        document.getElementById('sc-${scene.id}').classList.add('active');
      })()`
    );
    await new Promise((r) => setTimeout(r, 350));
    const img = await win.webContents.capturePage();
    const name = `frame-${String(idx + 1).padStart(2, '0')}-${scene.id}.png`;
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    const size = img.getSize();
    console.log(`[frames] ${scene.id}: ${name} (${size.width}x${size.height})`);
    out.push({ ...scene, frame: name });
  }

  fs.writeFileSync(
    path.join(OUT, 'frames.json'),
    JSON.stringify(out, null, 2)
  );
  console.log(`[frames] metadata → demo/out/frames.json`);
  win.destroy();
  app.exit(0);
});