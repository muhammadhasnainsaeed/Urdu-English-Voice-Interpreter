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
 * Deterministic tests for first-launch onboarding logic.
 *
 * Run:  npx tsx tests/setup-onboarding.test.ts
 *
 * Covers the pure setup-state derivation (mic permission states, output
 * device selection, BlackHole detection, overall ready/failure) and the
 * open-external allow-list. No audio, no network, no Electron.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedOpenExternalUrl,
  RENDERER_OPEN_EXTERNAL_LINKS,
} from "../packages/shared/index";
import {
  blackholeFromDeviceLabels,
  deriveSetupState,
  isBlackHoleLabel,
  type SetupInputs,
} from "../src/renderer/setup/setupState";

function baseInputs(overrides: Partial<SetupInputs> = {}): SetupInputs {
  return {
    probed: true,
    micPermission: "granted",
    hasMicDevice: true,
    outputDevices: [
      { id: "default", label: "System Default", isDefault: true },
      { id: "blackhole", label: "BlackHole 2ch", isDefault: false },
    ],
    selectedOutputDeviceId: "default",
    blackholeDetected: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  BlackHole label helpers                                            */
/* ------------------------------------------------------------------ */

test("isBlackHoleLabel matches common BlackHole device names", () => {
  assert.equal(isBlackHoleLabel("BlackHole 2ch"), true);
  assert.equal(isBlackHoleLabel("BlackHole 16ch"), true);
  assert.equal(isBlackHoleLabel("MacBook Pro Microphone"), false);
  assert.equal(isBlackHoleLabel(""), false);
});

test("blackholeFromDeviceLabels is true when any label is a BlackHole", () => {
  assert.equal(
    blackholeFromDeviceLabels(["System Default", "BlackHole 2ch"]),
    true
  );
  assert.equal(
    blackholeFromDeviceLabels(["System Default", "Speakers"]),
    false
  );
  assert.equal(blackholeFromDeviceLabels([]), false);
});

/* ------------------------------------------------------------------ */
/*  Open-external allow-list (main-process security gate)              */
/* ------------------------------------------------------------------ */

test("only the two onboarding links are allowed open-external", () => {
  assert.equal(
    isAllowedOpenExternalUrl(RENDERER_OPEN_EXTERNAL_LINKS.micPrivacySettings),
    true
  );
  assert.equal(
    isAllowedOpenExternalUrl(RENDERER_OPEN_EXTERNAL_LINKS.blackholeDownload),
    true
  );
});

test("arbitrary or prefixed-tampered URLs are blocked", () => {
  assert.equal(isAllowedOpenExternalUrl("https://evil.example.com/"), false);
  assert.equal(isAllowedOpenExternalUrl("file:///etc/passwd"), false);
  assert.equal(isAllowedOpenExternalUrl("javascript:alert(1)"), false);
  assert.equal(
    isAllowedOpenExternalUrl(
      RENDERER_OPEN_EXTERNAL_LINKS.blackholeDownload + "/../../../evil"
    ),
    false
  );
  assert.equal(
    isAllowedOpenExternalUrl(
      RENDERER_OPEN_EXTERNAL_LINKS.micPrivacySettings + "&extra=true"
    ),
    false
  );
});

/* ------------------------------------------------------------------ */
/*  deriveSetupState: probe lifecycle                                  */
/* ------------------------------------------------------------------ */

test("before the probe is finished, every step is checking", () => {
  const state = deriveSetupState(baseInputs({ probed: false }));
  assert.equal(state.mic.state, "checking");
  assert.equal(state.output.state, "checking");
  assert.equal(state.blackhole.state, "checking");
  assert.equal(state.ready, false);
});

test("full happy path: everything ready", () => {
  const state = deriveSetupState(baseInputs());
  assert.equal(state.mic.state, "ready");
  assert.equal(state.output.state, "ready");
  assert.equal(state.blackhole.state, "ready");
  assert.equal(state.ready, true);
  assert.equal(state.output.selectedDeviceLabel, "System Default");
});

/* ------------------------------------------------------------------ */
/*  Microphone permission states                                       */
/* ------------------------------------------------------------------ */

test("permission not determined: action-required with permission request", () => {
  const state = deriveSetupState(
    baseInputs({ micPermission: "not-determined", blackholeDetected: true })
  );
  assert.equal(state.mic.state, "action-required");
  assert.equal(state.mic.action, "request-permission");
  assert.equal(state.ready, false);
});

test("permission denied: error and opens settings", () => {
  const state = deriveSetupState(
    baseInputs({ micPermission: "denied", blackholeDetected: true })
  );
  assert.equal(state.mic.state, "error");
  assert.equal(state.mic.action, "open-settings");
  assert.equal(state.ready, false);
});

test("permission restricted is treated like denied", () => {
  const state = deriveSetupState(baseInputs({ micPermission: "restricted" }));
  assert.equal(state.mic.state, "error");
  assert.equal(state.mic.action, "open-settings");
});

test("permission granted but no mic device: error state", () => {
  const state = deriveSetupState(
    baseInputs({ hasMicDevice: false, blackholeDetected: true })
  );
  assert.equal(state.mic.state, "error");
  assert.equal(state.mic.action, "no-mic");
  assert.equal(state.ready, false);
});

test("permission still unknown after probe: stays on checking", () => {
  const state = deriveSetupState(baseInputs({ micPermission: "unknown" }));
  assert.equal(state.mic.state, "checking");
  assert.equal(state.ready, false);
});

/* ------------------------------------------------------------------ */
/*  Audio output selection                                             */
/* ------------------------------------------------------------------ */

test("output honours the selected device label", () => {
  const state = deriveSetupState(
    baseInputs({ selectedOutputDeviceId: "blackhole" })
  );
  assert.equal(state.output.state, "ready");
  assert.equal(state.output.selectedDeviceLabel, "BlackHole 2ch");
});

test("missing output devices map to the no-output error state", () => {
  const state = deriveSetupState(baseInputs({ outputDevices: [] }));
  assert.equal(state.output.state, "error");
  assert.equal(state.output.hasDevice, false);
  assert.equal(state.ready, false);
});

/* ------------------------------------------------------------------ */
/*  BlackHole detection                                                */
/* ------------------------------------------------------------------ */

test("BlackHole missing: action-required and setup not ready", () => {
  const state = deriveSetupState(
    baseInputs({ outputDevices: [{ id: "default", label: "System Default", isDefault: true }], blackholeDetected: false })
  );
  assert.equal(state.blackhole.state, "action-required");
  assert.equal(state.blackhole.installed, false);
  assert.equal(state.ready, false);
});

test("BlackHole detected from a device label alone", () => {
  const state = deriveSetupState(
    baseInputs({
      blackholeDetected: false,
      outputDevices: [
        { id: "default", label: "System Default", isDefault: true },
        { id: "bh", label: "BlackHole 16ch", isDefault: false },
      ],
    })
  );
  assert.equal(state.blackhole.state, "ready");
  assert.equal(state.blackhole.installed, true);
});

test("BlackHole detected via main-process HAL check alone", () => {
  const state = deriveSetupState(
    baseInputs({
      blackholeDetected: true,
      outputDevices: [{ id: "default", label: "System Default", isDefault: true }],
    })
  );
  assert.equal(state.blackhole.state, "ready");
  assert.equal(state.blackhole.installed, true);
  assert.equal(state.ready, true);
});

test("setup failure: denied mic, no BlackHole", () => {
  const state = deriveSetupState(
    baseInputs({
      micPermission: "denied",
      blackholeDetected: false,
      outputDevices: [{ id: "default", label: "System Default", isDefault: true }],
    })
  );
  assert.equal(state.mic.state, "error");
  assert.equal(state.blackhole.state, "action-required");
  assert.equal(state.ready, false);
});