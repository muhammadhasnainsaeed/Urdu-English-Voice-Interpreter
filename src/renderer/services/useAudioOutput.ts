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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioOutputDevice, AudioOutputEvent, AudioOutputStatus } from '@shared/index';
import { PcmPlaybackQueue } from '../audio/pcmPlayback';

/**
 * Renderer-side audio output hook.
 *
 * Uses real `navigator.mediaDevices.enumerateDevices()` for output device
 * discovery and `AudioContext.setSinkId()` (Chrome 110+) for device-targeted
 * playback. Falls back to the main-process static device list when the
 * renderer enumeration returns no output devices (e.g. before mic permission).
 */
export function useAudioOutput() {
  const [status, setStatus] = useState<AudioOutputStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
  const outputStartedRef = useRef(false);
  const [setSinkIdSupported] = useState(
    () => typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype,
  );
  const [player] = useState(
    () => new PcmPlaybackQueue({ onPlaybackEvent: (event) => window.electron.reportPlaybackEvent(event) }),
  );

  const playbackError = useCallback(
    (err: unknown) => {
      player.cancel();
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    },
    [player],
  );

  const enumerateOutputDevices = useCallback(async (): Promise<AudioOutputDevice[]> => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const outputs = allDevices.filter((d) => d.kind === 'audiooutput');
      if (outputs.length > 0) {
        return outputs.map((d) => ({
          id: d.deviceId,
          label: d.label || (d.deviceId === 'default' ? 'System Default' : d.deviceId),
          isDefault: d.deviceId === 'default' || d.deviceId === '',
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
      if (hasBlackHole && !staticList.some((d) => d.id === 'blackhole')) {
        staticList.push({ id: 'blackhole', label: 'BlackHole', isDefault: false });
      }
      return staticList;
    } catch {
      return [{ id: 'default', label: 'System Default', isDefault: true }];
    }
  }, []);

  useEffect(() => {
    enumerateOutputDevices().then(setDevices);
  }, [enumerateOutputDevices]);

  useEffect(() => {
    const onChange = () => {
      enumerateOutputDevices().then((devs) => {
        setDevices(devs);
        if (selectedDeviceId !== 'default' && !devs.some((d) => d.id === selectedDeviceId)) {
          // A fallback to speakers can feed translated audio back into the mic.
          playbackError(new Error('The selected audio output disconnected. Select an available device.'));
          void player.close().catch(playbackError);
        }
      });
    };
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
    };
  }, [enumerateOutputDevices, selectedDeviceId, player, playbackError]);

  useEffect(() => {
    return window.electron.onAudioOutputEvent((event: AudioOutputEvent) => {
      switch (event.type) {
        case 'audio-output:started':
          outputStartedRef.current = true;
          setError(null);
          setStatus('active');
          break;
        case 'audio-output:devices':
          // Merge with renderer-side devices if renderer list is empty
          setDevices((prev) => {
            if (prev.length <= 1 && event.devices.length > prev.length) {
              return event.devices;
            }
            return prev;
          });
          break;
        case 'audio-output:error':
          setError(event.message);
          setStatus('error');
          break;
        case 'audio-output:stopped':
          outputStartedRef.current = false;
          setStatus('idle');
          void player.close().catch(playbackError);
          break;
      }
    });
  }, [player, playbackError]);

  useEffect(() => {
    const unsub = window.electron.onAudioData((chunk) => {
      void player.enqueue(chunk).catch(playbackError);
    });
    return unsub;
  }, [player, playbackError]);

  useEffect(() => {
    return window.electron.onAudioCancel(() => player.cancel());
  }, [player]);

  useEffect(() => () => void player.close().catch(() => {}), [player]);

  const start = useCallback(async () => {
    setError(null);
    const result = await window.electron.startAudioOutput();
    if (!result.ok) {
      setError(result.message ?? 'Could not start audio output.');
      setStatus('error');
    }
  }, []);

  const prepare = useCallback(async () => {
    try {
      await player.prepare();
      setError(null);
    } catch (err) {
      playbackError(err);
      throw err;
    }
  }, [player, playbackError]);

  const stop = useCallback(async () => {
    setStatus('idle');
    outputStartedRef.current = false;
    await player.close();
    await window.electron.stopAudioOutput();
  }, [player]);

  const refreshDevices = useCallback(async () => {
    const devs = await enumerateOutputDevices();
    setDevices(devs);
  }, [enumerateOutputDevices]);

  const selectDevice = useCallback(
    async (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      await window.electron.selectAudioOutput(deviceId);
      try {
        await player.selectDevice(deviceId);
        setError(null);
        setStatus(outputStartedRef.current ? 'active' : 'idle');
      } catch (err) {
        playbackError(err);
      }
    },
    [player, playbackError],
  );

  return {
    status,
    error,
    devices,
    selectedDeviceId,
    setSinkIdSupported,
    start,
    prepare,
    stop,
    refreshDevices,
    selectDevice,
  };
}
