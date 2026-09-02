/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Dev runner: `npm run dev`
 *
 * Runs the esbuild/Tailwind watch build and an Electron app together, then
 * restarts Electron automatically whenever the main or preload bundle in
 * dist/ changes. Renderer (bundle.js) and Tailwind changes are rebuilt in
 * place by `watch`; the window reads them on reload — no Electron restart
 * needed for those.
 *
 * Restart detection polls the bundles' mtimes rather than fs.watch, because
 * macOS FSEvents coalescing can silently drop rapid in-place rewrites.
 *
 * Usage:
 *   npm run dev          # build-then-launch loop with auto-restart
 *   Ctrl+C               # stops everything (build watcher + Electron)
 *
 * Zero dependencies — plain Node + child_process.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const electronBin = path.join(root, 'node_modules/.bin/electron');

const restartFiles = [path.join(distDir, 'main/index.js'), path.join(distDir, 'preload/index.js')];

const POLL_MS = 400;
const SETTLE_MS = 600;
const RESTART_DEBOUNCE_MS = 300;

let electron = null;
let restartTimer = null;
let restartQueued = false;
let stopping = false;

let knownMtimes = restartFiles.map(() => 0);
let settledAt = 0;
let launched = false;

function startElectron() {
  if (stopping || electron) return;
  console.log('[dev] launching Electron...');
  electron = spawn(electronBin, ['.'], { cwd: root, stdio: 'inherit' });
  electron.on('exit', (code) => {
    electron = null;
    if (stopping) return;
    console.log(`[dev] Electron exited (code ${code ?? 'null'})`);
    if (restartQueued) {
      restartQueued = false;
      startElectron();
    }
  });
}

function queueRestart() {
  if (stopping || !electron) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartQueued = true;
    console.log('[dev] main/preload changed — restarting Electron...');
    electron?.kill('SIGTERM');
  }, RESTART_DEBOUNCE_MS);
}

function poll() {
  if (stopping) {
    clearTimeout(poll.timer);
    return;
  }

  const mtimes = restartFiles.map((file) => {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  });

  const changed = mtimes.some((mtime, i) => mtime !== knownMtimes[i]);
  knownMtimes = mtimes;

  if (changed) {
    settledAt = 0;
    if (launched) queueRestart();
  }

  const built = mtimes.every((mtime) => mtime > 0);

  if (!launched && built) {
    if (settledAt === 0) settledAt = Date.now();
    if (Date.now() - settledAt >= SETTLE_MS) {
      launched = true;
      startElectron();
    }
  }

  poll.timer = setTimeout(poll, POLL_MS);
}

// esbuild watch — rebuilds main, preload, renderer, and Tailwind on save.
console.log('[dev] starting esbuild watch...');
const watch = spawn(process.execPath, ['esbuild.config.js', '--watch'], {
  cwd: root,
  stdio: 'inherit',
});

watch.on('exit', (code) => {
  if (!stopping) {
    console.error(`[dev] esbuild watch exited (code ${code ?? 'null'}). Stopping.`);
  }
  process.exit(code ?? 0);
});

poll();

function shutdown() {
  stopping = true;
  clearTimeout(restartTimer);
  clearTimeout(poll.timer);
  electron?.kill('SIGTERM');
  watch.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
