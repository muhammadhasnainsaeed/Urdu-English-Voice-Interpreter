/*
 * Demo capture harness (Electron main).
 *
 * Loads the REAL built renderer (dist/renderer/index.html) with the scripted
 * demo preload, waits for each scenario to reach its polished state, and
 * produces further screenshots:
 *   - full page (strips stitched)   demo/out/<mode>-full.png
 *   - curated crops                 docs/images/<name>.png   (shipped assets)
 *   - capture metadata              demo/out/meta-<mode>.json
 *
 * macOS clamps window height to the screen, so pages taller than the viewport
 * are captured in overlapping vertical strips (window.scrollTo) and stitched
 * into one bitmap. A forced 2x device-scale factor keeps the output crisp.
 *
 * No screen-recording permission is needed: capturePage() captures this app's
 * own web contents.
 *
 * Run (from demo/):   ../node_modules/.bin/electron src/capture-app.mjs
 */

import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = process.env.DEMO_OUT || path.join(ROOT, 'demo', 'out');
const IMAGES = path.join(ROOT, 'docs', 'images');

const INDEX_HTML = path.join(ROOT, 'dist', 'renderer', 'index.html');
const PRELOAD = path.join(ROOT, 'demo', 'preload', 'demo-preload.js');

if (!fs.existsSync(INDEX_HTML)) {
  console.error('[demo] dist/renderer/index.html is missing — run `npm run build` first.');
  app.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(IMAGES, { recursive: true });

// Deterministic rendering: keep the page at dpr=2 so every captured bitmap is
// exactly 2x the CSS layout (crisp images) and DIP device math is consistent.
app.commandLine.appendSwitch('force-device-scale-factor', '2');

const WIDTH = 480;
const START_HEIGHT = 760;

const MODES = [
  {
    id: 'overview',
    crops: [{ name: 'app-overview', from: 'meeting', to: 'mic', pad: 12 }],
  },
  {
    id: 'live',
    crops: [{ name: 'live-translation', from: 'meeting', to: 'translation', pad: 12 }],
  },
  {
    id: 'telemetry',
    crops: [{ name: 'telemetry', from: 'pipeline', to: 'pipeline', pad: 12 }],
  },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const exec = (win, code) => win.webContents.executeJavaScript(code, true);

let windowCounter = 0;

async function waitForReady(win, timeoutMs = 25000) {
  const started = Date.now();
  for (;;) {
    try {
      const r = await exec(
        win,
        `(() => {
          const d = window.__demo;
          if (!d || !d.ready) return { ok: false };
          return {
            ok: true,
            rects: d.rects,
            scrollHeight: document.documentElement.scrollHeight,
            innerWidth: window.innerWidth,
          };
        })()`
      );
      if (r && r.ok) return r;
    } catch {
      /* renderer not up yet */
    }
    if (Date.now() - started > timeoutMs) break;
    await delay(120);
  }
  throw new Error('renderer never became ready (scenario did not settle in time)');
}

/** Grow the document past the window clamp and hide scrollbars. */
async function patchLayout(win) {
  await exec(
    win,
    `(() => {
      const st = document.createElement('style');
      st.setAttribute('data-demo', 'layout');
      st.textContent =
        '::-webkit-scrollbar{display:none!important}' +
        'html,body,#root{height:auto!important;min-height:100vh!important}' +
        '.screen.home-screen{height:auto!important;overflow:visible!important}';
      document.head.appendChild(st);
      return true;
    })()`
  );
  await delay(160);
}

/** Capture the full document height by stitching viewport-height strips. */
async function captureFullPage(win) {
  const doc = await exec(
    win,
    `({ h: document.documentElement.scrollHeight, w: window.innerWidth, vh: window.innerHeight })`
  );
  const W = doc.w;
  const docH = doc.h;
  const VH = doc.vh || 700;

  const strips = [];
  for (let y = 0; y < docH; y += VH) {
    await exec(win, `window.scrollTo(0, ${y})`);
    await delay(130);
    strips.push(await win.webContents.capturePage());
  }
  if (strips.length === 0) throw new Error('no strips captured');

  const scale = strips[0].getSize().width / W || 1;
  const Wd = Math.round(W * scale);
  const VHd = strips[0].getSize().height;
  const Hd = Math.round(docH * scale);

  const buf = Buffer.alloc(Wd * Hd * 4);
  let offset = 0;
  for (const s of strips) {
    const raw = s.toBitmap();
    const h = s.getSize().height;
    const len = Math.min(raw.length, Wd * 4 * h);
    raw.copy(buf, Wd * 4 * offset, 0, len);
    offset += h;
  }

  const img = nativeImage.createFromBitmap(buf, { width: Wd, height: Hd });
  return { img, scale, W, docH };
}

async function execRegionTexts(win, sels) {
  const pairs = sels.map((s) => JSON.stringify(s));
  return exec(
    win,
    `(() => { const out = {}; [${pairs.join(',')}].forEach(s => { const el = document.querySelector(s); out[s] = el ? el.innerText.replace(/[\\t\\n]+/g, ' | ').slice(0, 220) : '·MISSING·'; }); return out; })()`
  );
}

function cropImage(image, info, spec, scale) {
  const rFrom = spec.from ? info.rects?.[spec.from] : null;
  const rTo = spec.to ? info.rects?.[spec.to] : null;
  if (!rFrom) {
    console.warn(`  - region "${spec.from}" not found; skipping crop.`);
    return null;
  }
  const top = rFrom.top;
  const bottom = rTo ? rTo.bottom : rFrom.bottom;
  const left = Math.min(rFrom.left, rTo ? rTo.left : rFrom.left);

  const pad = spec.pad ?? 12;
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  const w = Math.round(info.innerWidth - x);
  const h = Math.round(bottom - top + pad * 2);

  try {
    // getSize()/crop use physical pixels; multiply CSS coords by the captured
    // device scale (2x via force-device-scale-factor) for crisp Retina output.
    return image.crop({
      x: Math.round(x * scale),
      y: Math.round(y * scale),
      width: Math.round(w * scale),
      height: Math.round(h * scale),
    });
  } catch (err) {
    console.warn('  - crop failed:', err.message);
    return null;
  }
}

async function captureMode(mode) {
  const tag = `[demo:${mode.id}]`;
  console.log(`${tag} capturing "${mode.id}"…`);
  windowCounter += 1;

  const win = new BrowserWindow({
    width: WIDTH,
    height: START_HEIGHT,
    useContentSize: true,
    show: false,
    resizable: true,
    title: `Demo capture — ${mode.id}`,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.setBackgroundThrottling(false);
  win.setMenuBarVisibility(false);

  try {
    await win.loadFile(INDEX_HTML, { query: { demo: mode.id } });
    win.showInactive();
    win.setPosition(-2500 - windowCounter * 40, -2500 + windowCounter * 30);

    const info = await waitForReady(win);

    const texts = await execRegionTexts(win, [
      '.meeting-section',
      '.mic-panel',
      mode.id === 'telemetry' ? '.pipeline-panel' : '.translation-section',
    ]);
    for (const [sel, text] of Object.entries(texts)) {
      console.log(`${tag} text[${sel}] → ${text}`);
    }

    await patchLayout(win);

    const { img, W, docH, scale } = await captureFullPage(win);
    fs.writeFileSync(path.join(OUT, `${mode.id}-full.png`), img.toPNG());
    console.log(`${tag} full page: ${img.getSize().width}x${img.getSize().height}`);

    for (const spec of mode.crops) {
      const part = cropImage(img, info, spec, scale);
      if (!part) continue;
      const dest = path.join(IMAGES, `${spec.name}.png`);
      fs.writeFileSync(dest, part.toPNG());
      console.log(`${tag} wrote ${spec.name}.png (${part.getSize().width}x${part.getSize().height})`);
    }

    fs.writeFileSync(
      path.join(OUT, `meta-${mode.id}.json`),
      JSON.stringify(
        { mode: mode.id, css: { width: W, docHeight: docH }, pixelSize: img.getSize(), rects: info.rects },
        null,
        2
      )
    );
  } finally {
    win.destroy();
  }
}

app.whenReady().then(async () => {
  try {
    for (const mode of MODES) await captureMode(mode);
    console.log('[demo] capture complete.');
    app.exit(0);
  } catch (err) {
    console.error('[demo] capture failed:', err);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  /* keep running between sequential capture windows; exit is explicit */
});

process.on('uncaughtException', (err) => {
  console.error('[demo] uncaught:', err);
  app.exit(1);
});