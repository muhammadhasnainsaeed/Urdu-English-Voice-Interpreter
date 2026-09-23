#!/usr/bin/env node
/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 *
 * Generates the macOS app icon (packaging/icon.png) — a 1024×1024 rounded
 * tile with the app's blue→green gradient, a white microphone glyph and
 * waveform bars. Fully dependency-free (raw RGBA raster + minimal PNG
 * encoder). electron-builder converts the PNG into the .icns it embeds.
 *
 * Usage:  node scripts/generate-icon.mjs [out.png]
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(__dirname, '..', 'packaging', 'icon.png');

const S = 1024; // tile edge (pixels)
const R = 228; // tile corner radius (macOS-style rounded square)

/* ---------------- minimal PNG encoder (RGBA 8-bit) ---------------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- geometry ---------------- */
function inRoundRect(x, y, rcx, rcy, w, h, r) {
  const x0 = rcx - w / 2;
  const y0 = rcy - h / 2;
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r));
  const cy = Math.max(y0 + r, Math.min(y, y0 + h - r));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* ---------------- render ---------------- */
const pixels = Buffer.alloc(S * S * 4); // transparent by default

// Diagonal brand gradient (matches the demo logo-mark / docs palette).
const C_A = [79, 124, 255]; // #4f7cff
const C_B = [34, 197, 94]; // #22c55e

const inTile = (x, y) => {
  const cx = Math.max(R, Math.min(x, S - R));
  const cy = Math.max(R, Math.min(y, S - R));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= R * R;
};

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inTile(x, y)) continue;
    const t = (x + y) / (2 * S);
    const i = (y * S + x) * 4;
    pixels[i] = lerp(C_A[0], C_B[0], t);
    pixels[i + 1] = lerp(C_A[1], C_B[1], t);
    pixels[i + 2] = lerp(C_A[2], C_B[2], t);
    pixels[i + 3] = 255;
  }
}

// Subtle white glass highlight near the top-left corner.
for (let y = 0; y < 430; y++) {
  for (let x = 0; x < 430; x++) {
    if (!inTile(x, y)) continue;
    const base = 190 - Math.min(150, (x + y) * 0.35);
    const i = (y * S + x) * 4;
    pixels[i] = Math.min(255, pixels[i] + base * 0.5);
    pixels[i + 1] = Math.min(255, pixels[i + 1] + base * 0.5);
    pixels[i + 2] = Math.min(255, pixels[i + 2] + base * 0.5);
  }
}

// Microphone glyph (white, slightly below vertical center) + waveform bars.
const WHITE = [255, 255, 255];
function draw(fn, color, alpha) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inTile(x, y) || !fn(x, y)) continue;
      const i = (y * S + x) * 4;
      const a = alpha / 255;
      pixels[i] = Math.round(color[0] * a + pixels[i] * (1 - a));
      pixels[i + 1] = Math.round(color[1] * a + pixels[i + 1] * (1 - a));
      pixels[i + 2] = Math.round(color[2] * a + pixels[i + 2] * (1 - a));
      pixels[i + 3] = Math.min(255, pixels[i + 3] + Math.round(alpha * (1 - pixels[i + 3] / 255)));
    }
  }
}

const C = S / 2;
const bodyW = 212;
const bodyH = 300;
const bodyCy = C - 60;

// Soft drop shadow under the glyph.
draw(
  (x, y) => inRoundRect(x, y, C + 18, C + 88, 250, 330, 40),
  [0, 0, 0],
  36,
);

// Mic capsule body.
draw(
  (x, y) => inRoundRect(x, y, C, bodyCy, bodyW, bodyH, bodyW / 2),
  WHITE,
  255,
);

// U-shaped stand surrounding the capsule (a ring with thickness).
const ringThickness = 44;
const ringOuterR = bodyW / 2 + ringThickness;
const ringGap = 26;
draw(
  (x, y) => {
    const dx = x - C;
    const dy = y - bodyCy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > ringOuterR || d < ringOuterR - ringThickness) return false;
    // Only the sweep below the capsule top so the "U" reads open.
    return y > bodyCy - bodyH / 2 + ringGap;
  },
  WHITE,
  255,
);

// Stem + base arc.
draw(
  (x, y) => inRoundRect(x, y, C, bodyCy + bodyH / 2 + ringThickness - 26, 44, 120, 22),
  WHITE,
  255,
);
draw(
  (x, y) => inRoundRect(x, y, C, bodyCy + bodyH / 2 + ringThickness + 96, 250, 54, 27),
  WHITE,
  255,
);

// Waveform bars below the base.
const bars = [
  { h: 96 },
  { h: 156 },
  { h: 216 },
  { h: 156 },
  { h: 96 },
];
const barGap = 30;
const barW = 52;
const baselineY = bodyCy + bodyH / 2 + ringThickness + 96 + 54 + 40;
const totalW = bars.length * barW + (bars.length - 1) * barGap;
const startX = C - totalW / 2 + barW / 2;
bars.forEach((bar, i) => {
  const cx = startX + i * (barW + barGap);
  draw((x, y) => inRoundRect(x, y, cx, baselineY - bar.h / 2, barW, bar.h, barW / 2), WHITE, 255);
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodePng(S, S, pixels));
console.log(`[icon] wrote ${OUT} (${S}x${S})`);