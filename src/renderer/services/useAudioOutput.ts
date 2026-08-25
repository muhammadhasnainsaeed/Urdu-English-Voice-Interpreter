import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AudioFormat,
  AudioOutputDevice,
  AudioOutputEvent,
  AudioOutputStatus,
} from "@shared/index";

const BLACKHOLE_PATTERN = /blackhole/i;

/**
 * Renderer-side audio output hook.
 *
 * Uses real `navigator.mediaDevices.enumerateDevices()` for output device
 * discovery and `AudioContext.setSinkId()` (Chrome 110+) for device-targeted
 * playback. Falls back to the main-process static device list when the
 * renderer enumeration returns no output devices (e.g. before mic permission).
 */
export function useAudioOutput() {
  const [status, setStatus] = useState<AudioOutputStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [setSinkIdSupported, setSetSinkIdSupported] = useState(true);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSinkRef = useRef<string>("");
  const queueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);
  const sampleRateRef = useRef(24000);

  const supportsSetSinkId = useCallback(() => {
    return typeof AudioContext !== "undefined" &&
      "setSinkId" in AudioContext.prototype;
  }, []);

  const enumerateOutputDevices = useCallback(async (): Promise<AudioOutputDevice[]> => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const outputs = allDevices.filter((d) => d.kind === "audiooutput");
      if (outputs.length > 0) {
        return outputs.map((d) => ({
          id: d.deviceId,
          label: d.label || (d.deviceId === "default" ? "System Default" : d.deviceId),
          isDefault: d.deviceId === "default" || d.deviceId === "",
        }));
      }
    } catch {
      // enumerateDevices can fail before permission is granted
    }
    // Fallback: main process static list + BlackHole detection
    try {
      const staticList = await window.electron.getAudioOutputDevices();
      if (staticList.length > 1) return staticList;
      // If static list only has "default", check BlackHole via main process
      const hasBlackHole = await window.electron.detectBlackHole();
      if (hasBlackHole && !staticList.some((d) => d.id === "blackhole")) {
        staticList.push({ id: "blackhole", label: "BlackHole", isDefault: false });
      }
      return staticList;
    } catch {
      return [{ id: "default", label: "System Default", isDefault: true }];
    }
  }, []);

  useEffect(() => {
    enumerateOutputDevices().then(setDevices);
  }, [enumerateOutputDevices]);

  useEffect(() => {
    const onChange = () => {
      enumerateOutputDevices().then((devs) => {
        setDevices(devs);
        // Device failure recovery: if selected device is gone, fall back to default
        setSelectedDeviceId((current) => {
          if (current === "default") return current;
          if (devs.some((d) => d.id === current)) return current;
          // Selected device disconnected — fall back to system default
          return "default";
        });
      });
    };
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onChange);
    };
  }, [supportsSetSinkId, enumerateOutputDevices]);

  useEffect(() => {
    return window.electron.onAudioOutputEvent((event: AudioOutputEvent) => {
      switch (event.type) {
        case "audio-output:started":
          setError(null);
          setStatus("active");
          break;
        case "audio-output:devices":
          // Merge with renderer-side devices if renderer list is empty
          setDevices((prev) => {
            if (prev.length <= 1 && event.devices.length > prev.length) {
              return event.devices;
            }
            return prev;
          });
          break;
        case "audio-output:error":
          setError(event.message);
          break;
        case "audio-output:stopped":
          setStatus("idle");
          break;
      }
    });
  }, []);

  const applySinkId = useCallback(async (ctx: AudioContext, deviceId: string): Promise<void> => {
    if (!supportsSetSinkId()) return;

    const targetId = deviceId === "default" || deviceId === "" ? "" : deviceId;
    if (targetId === currentSinkRef.current) return;

    try {
      await ctx.setSinkId(targetId);
      currentSinkRef.current = targetId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`setSinkId(${deviceId}) failed: ${msg}`);
      // Non-fatal: audio still plays to system default
    }
  }, [supportsSetSinkId]);

  const ensureContext = useCallback(async (
    sampleRate: number,
    deviceId?: string,
  ): Promise<AudioContext> => {
    const wantDevice = deviceId ?? selectedDeviceId;

    // Recreate if closed or sample rate changed
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      if (audioCtxRef.current.sampleRate !== sampleRate) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    }

    if (!audioCtxRef.current) {
      if (supportsSetSinkId() && wantDevice && wantDevice !== "default") {
        audioCtxRef.current = new AudioContext({ sampleRate });
        await applySinkId(audioCtxRef.current, wantDevice);
      } else {
        audioCtxRef.current = new AudioContext({ sampleRate });
      }
    }

    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    return audioCtxRef.current;
  }, [selectedDeviceId, supportsSetSinkId, applySinkId]);

  const playFromQueue = useCallback(async () => {
    if (playingRef.current || queueRef.current.length === 0) return;
    playingRef.current = true;

    while (queueRef.current.length > 0) {
      const data = queueRef.current.shift()!;
      const sampleRate = sampleRateRef.current;

      const ctx = await ensureContext(sampleRate);

      const sampleCount = data.byteLength / 2;
      const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
      const int16 = new Int16Array(data);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        channelData[i] = int16[i] / 32768;
      }

      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          window.electron.reportPlaybackEvent({
            event: "complete",
            bytes: data.byteLength,
          });
          resolve();
        };
        window.electron.reportPlaybackEvent({
          event: "start",
          bytes: data.byteLength,
        });
        source.start();
      });
    }

    playingRef.current = false;
  }, [ensureContext]);

  useEffect(() => {
    const unsub = window.electron.onAudioData(
      (chunk: { data: ArrayBuffer; format: AudioFormat }) => {
        sampleRateRef.current = chunk.format.sampleRate;
        queueRef.current.push(chunk.data);
        playFromQueue();
      }
    );
    return unsub;
  }, [playFromQueue]);

  const start = useCallback(async () => {
    setError(null);
    const result = await window.electron.startAudioOutput();
    if (!result.ok) {
      setError(result.message ?? "Could not start audio output.");
      setStatus("error");
    }
  }, []);

  const stop = useCallback(async () => {
    setStatus("idle");
    queueRef.current = [];
    playingRef.current = false;
    currentSinkRef.current = "";
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    await window.electron.stopAudioOutput();
  }, []);

  const refreshDevices = useCallback(async () => {
    const devs = await enumerateOutputDevices();
    setDevices(devs);
  }, [enumerateOutputDevices]);

  const selectDevice = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    await window.electron.selectAudioOutput(deviceId);

    // Apply to active AudioContext if one exists
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      await applySinkId(audioCtxRef.current, deviceId);
    }
  }, [applySinkId]);

  return {
    status,
    error,
    devices,
    selectedDeviceId,
    setSinkIdSupported,
    start,
    stop,
    refreshDevices,
    selectDevice,
  };
}
