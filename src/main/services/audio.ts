import { systemPreferences } from "electron";
import type { PermissionStatus } from "@shared/index";

export function getMicrophonePermission(): PermissionStatus {
  const status = systemPreferences.getMediaAccessStatus("microphone");
  switch (status) {
    case "granted":
    case "denied":
    case "restricted":
    case "not-determined":
      return status;
    default:
      return "unknown";
  }
}

export async function requestMicrophonePermission(): Promise<PermissionStatus> {
  try {
    const granted = await systemPreferences.askForMediaAccess("microphone");
    return granted ? "granted" : "denied";
  } catch {
    return "unknown";
  }
}
