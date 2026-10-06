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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OVERLAY_BOTTOM_GAP,
  SUBTITLE_BROADCAST_CHANNELS,
  isSubtitleChannel,
  overlayGeometry,
} from '../src/main/windows';

test('overlay geometry centers horizontally above the Dock', () => {
  const geo = overlayGeometry({ x: 0, y: 0, width: 1512, height: 950 }, { width: 460, height: 176 });
  assert.equal(geo.width, 460);
  assert.equal(geo.height, 176);
  assert.equal(geo.x, Math.round((1512 - 460) / 2));
  assert.equal(geo.y, 950 - OVERLAY_BOTTOM_GAP - 176);
});

test('overlay geometry offsets by the work-area origin (secondary display)', () => {
  const geo = overlayGeometry({ x: 1512, y: 100, width: 1920, height: 1080 }, { width: 460, height: 176 });
  assert.equal(geo.x, 1512 + Math.round((1920 - 460) / 2));
  assert.equal(geo.y, 100 + 1080 - OVERLAY_BOTTOM_GAP - 176);
});

test('overlay geometry clamps into a tiny work area', () => {
  const geo = overlayGeometry({ x: 0, y: 0, width: 320, height: 200 }, { width: 460, height: 176 });
  assert.equal(geo.width, 320);
  assert.equal(geo.height, 176);
  assert.equal(geo.x, 0);
  assert.ok(geo.y >= 0, 'y must stay inside the work area');
});

test('subtitle channels are exactly stt/translation/session events', () => {
  assert.deepEqual([...SUBTITLE_BROADCAST_CHANNELS], ['stt:event', 'translation:event', 'session:event']);
  for (const channel of SUBTITLE_BROADCAST_CHANNELS) {
    assert.equal(isSubtitleChannel(channel), true, `${channel} must broadcast`);
  }
});

test('pipeline, audio, telemetry and overlay control channels never broadcast', () => {
  const mainOnly = [
    'tts:event',
    'audio-output:event',
    'audio-output:audio',
    'pipeline:event',
    'overlay:event',
    'stt:audio-data',
  ];
  for (const channel of mainOnly) {
    assert.equal(isSubtitleChannel(channel), false, `${channel} must stay main-window only`);
  }
});
