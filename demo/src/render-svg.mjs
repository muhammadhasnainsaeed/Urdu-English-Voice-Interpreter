/*
 * Renders an SVG file to a PNG at exact dimensions using Chromium.
 *
 * Usage:  <electron> src/render-svg.mjs <input.svg> <output.png> [pixelHeight=1080]
 *
 * macOS qlmanage letterboxes odd-aspect SVGs to a square; this renderer keeps
 * the exact SVG aspect ratio and produces a crisp, antialiased bitmap.
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const inFile = args[0];
const outFile = args[1];
const targetHeight = args[2] ? Number(args[2]) : 1080;

if (!inFile || !outFile) {
  console.error('[render-svg] usage: electron src/render-svg.mjs <input.svg> <output.png> [pixelHeight]');
  app.exit(2);
}

// Force nearest-integer 2x scale so the captured bitmap is exactly 2x the CSS size.
app.commandLine.appendSwitch('force-device-scale-factor', '2');

const OUT_HEIGHT_CSS = Math.round(targetHeight);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1920,
      height: OUT_HEIGHT_CSS,
      useContentSize: true,
      show: false,
      webPreferences: { backgroundThrottling: false },
    });
    win.webContents.setBackgroundThrottling(false);
    await win.loadFile(path.resolve(ROOT, inFile));
    await new Promise((r) => setTimeout(r, 450));

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.resolve(ROOT, outFile), img.toPNG());
    console.log(
      `[render-svg] ${inFile} → ${outFile} (${img.getSize().width}x${img.getSize().height})`
    );
    win.destroy();
    app.exit(0);
  } catch (err) {
    console.error('[render-svg] failed:', err);
    app.exit(1);
  }
});