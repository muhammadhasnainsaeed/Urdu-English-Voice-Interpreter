import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApplicationStatus,
  AudioDevice,
  PermissionStatus,
} from "@shared/index";

export interface MicrophoneCaptureResult {
  ok: boolean;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
}

function captureErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Microphone permission was denied. Enable it in System Settings → Privacy & Security → Microphone.";
      case "NotFoundError":
        return "No microphone is available.";
      case "NotReadableError":
        return "The microphone is busy (used by another app) or unavailable.";
      case "OverconstrainedError":
        return "The selected microphone is unavailable.";
      default:
        return `Could not start capture (${err.name}).`;
    }
  }
  return "Could not start capture.";
}

export function useMicrophone() {
  const [permission, setPermission] = useState<PermissionStatus>("unknown");
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const permissionRef = useRef(permission);
  const statusRef = useRef<ApplicationStatus>("idle");

  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const refreshDevices = useCallback(async (): Promise<AudioDevice[]> => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs: AudioDevice[] = list
        .filter((d) => d.kind === "audioinput" && d.deviceId !== "")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || "Microphone",
          type: "input" as const,
        }));
      setDevices(inputs);
      setSelectedDeviceId((current) => {
        if (current && inputs.some((d) => d.deviceId === current)) return current;
        return inputs.length > 0 ? inputs[0].deviceId : null;
      });
      if (inputs.length === 0) {
        setStatus((s) => (s === "listening" ? s : "error"));
        setError("No microphone found.");
      } else {
        setError(null);
        setStatus((s) => (s === "error" ? "ready" : s));
      }
      return inputs;
    } catch {
      setError("Could not list audio devices.");
      return [];
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    setStatus("requesting-permission");
    setError(null);
    try {
      const result = await window.electron.requestMicPermission();
      setPermission(result);
      if (result === "granted") {
        setStatus("ready");
        return true;
      }
      setStatus("error");
      setError(
        result === "denied"
          ? "Microphone permission was denied. Enable it in System Settings → Privacy & Security → Microphone."
          : "Could not determine microphone permission."
      );
      return false;
    } catch {
      setStatus("error");
      setError("Failed to request microphone permission.");
      return false;
    }
  }, []);

  const start = useCallback(async (): Promise<MicrophoneCaptureResult> => {
    setError(null);

    if (statusRef.current === "listening") {
      return {
        ok: true,
        stream: streamRef.current,
        audioContext: audioContextRef.current,
      };
    }

    let granted = permission === "granted";
    if (!granted) granted = await requestPermission();
    if (!granted) {
      return { ok: false, stream: null, audioContext: null };
    }

    const currentDevices = await refreshDevices();
    if (currentDevices.length === 0) {
      setStatus("error");
      setError("No microphone found.");
      return { ok: false, stream: null, audioContext: null };
    }

    const deviceId = selectedDeviceId ?? currentDevices[0].deviceId;
    if (!deviceId) {
      setStatus("error");
      setError("No microphone is selected.");
      return { ok: false, stream: null, audioContext: null };
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
      } catch (err) {
        if (
          err instanceof DOMException &&
          err.name === "OverconstrainedError"
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw err;
        }
      }

      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 5));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setStatus("listening");
      refreshDevices();
      return { ok: true, stream, audioContext };
    } catch (err) {
      setStatus("error");
      setError(captureErrorMessage(err));
      return { ok: false, stream: null, audioContext: null };
    }
  }, [permission, requestPermission, refreshDevices, selectedDeviceId]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    setLevel(0);
    setStatus(permissionRef.current === "granted" ? "ready" : "idle");
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.electron
      .getMicPermission()
      .then((result) => {
        if (cancelled) return;
        setPermission(result);
        if (result === "granted") {
          refreshDevices();
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not read microphone permission from the main process.");
        }
      });

    const onDeviceChange = () => {
      if (cancelled) return;
      refreshDevices();
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      stop();
    };
  }, [refreshDevices, stop]);

  return {
    permission,
    devices,
    selectedDeviceId,
    status,
    level,
    error,
    selectDevice: setSelectedDeviceId,
    refreshDevices,
    requestPermission,
    start,
    stop,
  };
}
