/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationSettings, SessionStatus } from '@shared/index';
import { PcmPlaybackQueue } from '../audio/pcmPlayback';
import { createPcmTap, createResampler, toInt16Pcm, TARGET_SAMPLE_RATE, type PcmTap } from '../audio/pcmTap';

export function useIncoming() {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [original, setOriginal] = useState('');
  const [translated, setTranslated] = useState('');
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const tap = useRef<PcmTap | null>(null);
  const devices = useRef<string[]>([]);
  const [player] = useState(
    () =>
      new PcmPlaybackQueue({
        onPlaybackEvent: (event) => window.electron.reportIncomingPlaybackEvent(event),
      }),
  );
  const invalidateStart = useCallback(() => {
    ++generation.current;
  }, []);

  const release = useCallback(() => {
    active.current = false;
    tap.current?.disconnect();
    tap.current = null;
    stream.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
    devices.current = [];
    void player.close().catch(() => {});
  }, [player]);

  const stop = useCallback(async () => {
    ++generation.current;
    release();
    await window.electron.stopIncoming();
    setStatus('idle');
  }, [release]);

  const fail = useCallback(
    (message: string) => {
      ++generation.current;
      release();
      setError(message);
      setStatus('error');
      void window.electron.stopIncoming().catch(() => {});
    },
    [release],
  );

  useEffect(() => {
    const offEvent = window.electron.onIncomingEvent((event) => {
      if (event.type === 'incoming:error') fail(event.message);
      if (event.type === 'incoming:status') {
        if (event.status === 'idle' || event.status === 'error') release();
        setStatus((current) => (current === 'error' && event.status === 'idle' ? current : event.status));
      }
      if (event.type === 'incoming:stt' && event.event.type === 'final') setOriginal(event.event.text);
      if (event.type === 'incoming:stt' && event.event.type === 'partial') setOriginal(event.event.text);
      if (event.type === 'incoming:translation' && event.event.type === 'translation:text')
        setTranslated(event.event.english);
    });
    const offAudio = window.electron.onIncomingAudio((chunk) => {
      if (active.current)
        void player
          .enqueue(chunk)
          .catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
    });
    const offCancel = window.electron.onIncomingCancel(() => player.cancel());
    const changed = async () => {
      if (!active.current) return;
      const current = await navigator.mediaDevices.enumerateDevices();
      if (devices.current.some((id) => !current.some((device) => device.deviceId === id))) {
        fail('The client audio cable or headphones disconnected. Select an available device and restart.');
      }
    };
    navigator.mediaDevices.addEventListener('devicechange', changed);
    return () => {
      invalidateStart();
      offEvent();
      offAudio();
      offCancel();
      navigator.mediaDevices.removeEventListener('devicechange', changed);
      release();
      void window.electron.stopIncoming().catch(() => {});
    };
  }, [player, release, fail, invalidateStart]);

  const start = useCallback(
    async (settings: ConversationSettings): Promise<boolean> => {
      const run = ++generation.current;
      setError(null);
      setOriginal('');
      setTranslated('');
      setStatus('starting');
      try {
        if (!settings.incomingDeviceId || !settings.listeningDeviceId)
          throw new Error('Select client audio and headphones first.');
        await player.selectDevice(settings.listeningDeviceId);
        await player.prepare();
        if (run !== generation.current) return false;
        const capture = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: settings.incomingDeviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
        if (run !== generation.current) {
          capture.getTracks().forEach((track) => track.stop());
          return false;
        }
        stream.current = capture;
        capture.getAudioTracks().forEach((track) => {
          track.onended = () => fail('Client audio capture ended. Reconnect the audio cable and restart.');
        });
        const audioContext = new AudioContext();
        context.current = audioContext;
        await audioContext.resume();
        const resample = createResampler(audioContext.sampleRate, TARGET_SAMPLE_RATE);
        const captureTap = await createPcmTap(audioContext, capture, (frames) => {
          if (!active.current) return;
          const pcm = resample(frames);
          if (pcm.length) window.electron.sendIncomingAudio(toInt16Pcm(pcm));
        });
        if (run !== generation.current) {
          captureTap.disconnect();
          return false;
        }
        tap.current = captureTap;
        devices.current = [settings.incomingDeviceId, settings.listeningDeviceId];
        active.current = true;
        const result = await window.electron.startIncoming();
        if (run !== generation.current) return false;
        if (!result.ok) throw new Error(result.message ?? 'Could not start client translation.');
        setStatus('active');
        return true;
      } catch (err) {
        if (run === generation.current) fail(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [player, fail],
  );

  const clear = useCallback(() => {
    setOriginal('');
    setTranslated('');
  }, []);
  return { status, original, translated, error, start, stop, clear };
}
