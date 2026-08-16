const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

function copyIndexHtml() {
  const src = path.join(__dirname, 'src/renderer/index.html');
  const destDir = path.join(__dirname, 'dist/renderer');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, 'index.html'));
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
    external: ['electron'],
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
    define: {
      'process.env.NODE_ENV': watch ? '"development"' : '"production"',
    },
  });

  copyIndexHtml();

  if (watch) {
    await Promise.all([
      mainCtx.watch(),
      preloadCtx.watch(),
      rendererCtx.watch(),
    ]);
  } else {
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
