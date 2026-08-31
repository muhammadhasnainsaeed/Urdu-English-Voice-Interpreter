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
const { execSync } = require('child_process');

const watch = process.argv.includes('--watch');

const root = __dirname;

function copyIndexHtml() {
  const src = path.join(root, 'src/renderer/index.html');
  const destDir = path.join(root, 'dist/renderer');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, 'index.html'));
}

/** Compile Tailwind CSS (globals.css -> dist/renderer/tailwind.css). */
function buildTailwind() {
  const input = path.join(root, 'src/renderer/styles/globals.css');
  const outDir = path.join(root, 'dist/renderer');
  fs.mkdirSync(outDir, { recursive: true });
  const output = path.join(outDir, 'tailwind.css');
  const binary = path.join(root, 'node_modules/.bin/tailwindcss');
  execSync(`"${binary}" -c "${path.join(root, 'tailwind.config.js')}" -i "${input}" -o "${output}" ${watch ? '--watch' : '--minify'}`, {
    stdio: 'inherit',
  });
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
    buildTailwind();
    await Promise.all([
      mainCtx.watch(),
      preloadCtx.watch(),
      rendererCtx.watch(),
    ]);
  } else {
    buildTailwind();
    await Promise.all([
      mainCtx.rebuild(),
      preloadCtx.rebuild(),
      rendererCtx.rebuild(),
    ]);
    await Promise.all([
      mainCtx.dispose(),
      preloadCtx.dispose(),
      rendererCtx.dispose(),
    ]);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
