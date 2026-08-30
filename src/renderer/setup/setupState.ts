import type { PermissionStatus } from "@shared/index";

/**
 * Pure derivation of first-launch onboarding state. Kept side-effect free so
 * the states are deterministic and unit-testable without a browser or React.
 */

export type SetupStepState =
  | "checking"
  | "ready"
  | "action-required"
  | "error";

export interface OutputDeviceInfo {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface SetupMicResult {
  state: SetupStepState;
  permission: PermissionStatus;
  hasDevice: boolean;
  /** Which handler the UI should offer. */
  action: "none" | "request-permission" | "open-settings" | "no-mic";
}

export interface SetupOutputResult {
  state: SetupStepState;
  hasDevice: boolean;
  selectedDeviceLabel: string | null;
}

export interface SetupBlackHoleResult {
  state: SetupStepState;
  installed: boolean;
}

export interface SetupState {
  mic: SetupMicResult;
  output: SetupOutputResult;
  blackhole: SetupBlackHoleResult;
  /** All actionable prerequisites satisfied (mic + output + BlackHole). */
  ready: boolean;
}

export interface SetupInputs {
  /** True once the initial permission/BlackHole/device probe has finished. */
  probed: boolean;
  micPermission: PermissionStatus;
  hasMicDevice: boolean;
  outputDevices: OutputDeviceInfo[];
  selectedOutputDeviceId: string;
  blackholeDetected: boolean;
}

export function isBlackHoleLabel(label: string): boolean {
  return /blackhole/i.test(label);
}

export function blackholeFromDeviceLabels(labels: string[]): boolean {
  return labels.some(isBlackHoleLabel);
}

export function deriveSetupState(inputs: SetupInputs): SetupState {
  const blackholeFromCandidates: boolean =
    inputs.blackholeDetected ||
    blackholeFromDeviceLabels(
      inputs.outputDevices.map((d) => d.label)
    );

  if (!inputs.probed) {
    return {
      mic: {
        state: "checking",
        permission: inputs.micPermission,
        hasDevice: inputs.hasMicDevice,
        action: "none",
      },
      output: { state: "checking", hasDevice: false, selectedDeviceLabel: null },
      blackhole: { state: "checking", installed: false },
      ready: false,
    };
  }

  let mic: SetupMicResult;
  switch (inputs.micPermission) {
    case "granted":
      if (inputs.hasMicDevice) {
        mic = {
          state: "ready",
          permission: "granted",
          hasDevice: true,
          action: "none",
        };
      } else {
        mic = {
          state: "error",
          permission: "granted",
          hasDevice: false,
          action: "no-mic",
        };
      }
      break;
    case "not-determined":
      mic = {
        state: "action-required",
        permission: "not-determined",
        hasDevice: inputs.hasMicDevice,
        action: "request-permission",
      };
      break;
    case "denied":
    case "restricted":
      mic = {
        state: "error",
        permission: inputs.micPermission,
        hasDevice: inputs.hasMicDevice,
        action: "open-settings",
      };
      break;
    case "unknown":
    default:
      mic = {
        state: "checking",
        permission: "unknown",
        hasDevice: inputs.hasMicDevice,
        action: "none",
      };
      break;
  }

  let output: SetupOutputResult;
  if (inputs.outputDevices.length === 0) {
    output = { state: "error", hasDevice: false, selectedDeviceLabel: null };
  } else {
    const selected =
      inputs.outputDevices.find((d) => d.id === inputs.selectedOutputDeviceId) ??
      inputs.outputDevices.find((d) => d.isDefault) ??
      inputs.outputDevices[0];
    output = {
      state: "ready",
      hasDevice: true,
      selectedDeviceLabel: selected?.label ?? null,
    };
  }

  const blackhole: SetupBlackHoleResult = blackholeFromCandidates
    ? { state: "ready", installed: true }
    : { state: "action-required", installed: false };

  const ready =
    mic.state === "ready" && output.state === "ready" && blackhole.installed;

  return { mic, output, blackhole, ready };
}