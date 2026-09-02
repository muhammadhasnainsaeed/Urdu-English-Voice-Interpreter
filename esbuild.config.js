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

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const watch = process.argv.includes('--watch');

const root = __dirname;

function copyIndexHtml() {
  const src = path.join(root, 'src/renderer/index.html');
  const destDir = path.join(root, 'dist/renderer');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, 'index.html'));
}

const tailwindBinary = path.join(root, 'node_modules/.bin/tailwindcss');
const tailwindCssInput = path.join(root, 'src/renderer/styles/globals.css');
const tailwindCssOutput = path.join(root, 'dist/renderer/tailwind.css');
const tailwindConfig = path.join(root, 'tailwind.config.js');

/** One-shot Tailwind compile. `minify` controls --minify; never passes --watch. */
function compileTailwind(minify) {
  fs.mkdirSync(path.dirname(tailwindCssOutput), { recursive: true });
  execSync(
    `"${tailwindBinary}" -c "${tailwindConfig}" -i "${tailwindCssInput}" -o "${tailwindCssOutput}" ${minify ? '--minify' : ''}`,
    { stdio: 'inherit' },
  );
}

/**
 * Background Tailwind watcher for dev. Spawned (not execSync) so it keeps
 * running, and `--watch=always` keeps it alive after stdin closes — Tailwind
 * v3.4 aborts `--watch` on stdin EOF (zombie prevention), which is why the
 * old `execSync(... --watch)` silently never rebuilt CSS.
 */
function startTailwindWatcher() {
  const child = spawn(
    tailwindBinary,
    ['-c', tailwindConfig, '-i', tailwindCssInput, '-o', tailwindCssOutput, '--watch=always'],
    { stdio: 'inherit' },
  );
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[esbuild] Tailwind watcher exited unexpectedly (code ${code})`);
      process.exit(1);
    }
  });
  return child;
}

/** @type {import('esbuild').BuildOptions} */
const commonConfig = {
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  logLevel: 'info',
};

async function build() {
  // Main Process
  const mainCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main/index.js',
    platform: 'node',
    external: ['electron', 'microsoft-cognitiveservices-speech-sdk'],
    define: {
      'process.env.NODE_ENV': watch ? '"development"' : '"production"',
    },
  });

  // Preload Script
  const preloadCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: ['src/preload/index.ts'],
    outfile: 'dist/preload/index.js',
    platform: 'node',
    external: ['electron'],
  });

  // Renderer Process
  const rendererCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: ['src/renderer/index.tsx'],
    outfile: 'dist/renderer/bundle.js',
    platform: 'browser',
    loader: {
      '.css': 'css',
    },
    alias: {
      '@': path.join(root, 'src/renderer'),
    },
    define: {
      'process.env.NODE_ENV': watch ? '"development"' : '"production"',
    },
  });

  copyIndexHtml();

  if (watch) {
    compileTailwind(false);
    startTailwindWatcher();
    await Promise.all([mainCtx.watch(), preloadCtx.watch(), rendererCtx.watch()]);
  } else {
    compileTailwind(true);
    await Promise.all([mainCtx.rebuild(), preloadCtx.rebuild(), rendererCtx.rebuild()]);
    await Promise.all([mainCtx.dispose(), preloadCtx.dispose(), rendererCtx.dispose()]);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
