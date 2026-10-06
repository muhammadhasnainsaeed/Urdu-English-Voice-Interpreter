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
import type { SttEvent, SttStatus } from '@shared/index';
import { createPcmTap, createResampler, TARGET_SAMPLE_RATE, toInt16Pcm, type PcmTap } from '../audio/pcmTap';

const PROCESSING_RESET_MS = 350;

export function useStt() {
  const [status, setStatus] = useState<SttStatus>('idle');
  const [partialText, setPartialText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const tapRef = useRef<PcmTap | null>(null);
  const startGenerationRef = useRef(0);
  const pendingStartGenerationRef = useRef<number | null>(null);
  const statusRef = useRef<SttStatus>('idle');
  const processingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const isActive = status === 'starting' || status === 'listening' || status === 'processing';

  const stopFeeding = useCallback(() => {
    const tap = tapRef.current;
    if (tap) {
      tap.disconnect();
      tapRef.current = null;
    }
  }, []);

  const onEvent = useCallback(
    (event: SttEvent) => {
      switch (event.type) {
        case 'started':
          setError(null);
          setStatus('listening');
          break;
        case 'partial':
          setPartialText(event.text);
          break;
        case 'final':
          setPartialText('');
          setFinalText((prev) => (prev ? `${prev}\n` : '') + event.text);
          setStatus('processing');
          if (processingTimerRef.current) {
            window.clearTimeout(processingTimerRef.current);
          }
          processingTimerRef.current = window.setTimeout(() => {
            if (statusRef.current === 'processing') {
              setStatus('listening');
            }
          }, PROCESSING_RESET_MS);
          break;
        case 'error':
          setError(event.message);
          setStatus('error');
          stopFeeding();
          break;
        case 'stopped':
          stopFeeding();
          setStatus('idle');
          setProvider(null);
          break;
      }
    },
    [stopFeeding],
  );
  useEffect(() => {
    const unsubscribe = window.electron.onSttEvent(onEvent);
    return unsubscribe;
  }, [onEvent]);

  const start = useCallback(
    async (stream: MediaStream, audioContext: AudioContext): Promise<boolean> => {
      const generation = ++startGenerationRef.current;
      pendingStartGenerationRef.current = generation;
      setError(null);
      setErrorCode(null);
      setPartialText('');
      setStatus('starting');

      const resampler = createResampler(audioContext.sampleRate, TARGET_SAMPLE_RATE);

      // AudioWorklet tap (ScriptProcessorNode fallback inside) → resample to
      // 16 kHz → Int16 PCM → STT IPC. Silent graph (zero gain) keeps the
      // context running without audible feedback.
      let tap: PcmTap;
      try {
        tap = await createPcmTap(audioContext, stream, (frames) => {
          const activeStatus = statusRef.current;
          if (activeStatus !== 'listening' && activeStatus !== 'processing' && activeStatus !== 'starting') {
            return;
          }
          const resampled = resampler(frames);
          if (resampled.length > 0) {
            window.electron.sendSttAudio(toInt16Pcm(resampled));
          }
        });
      } catch (err) {
        if (generation !== startGenerationRef.current) return false;
        pendingStartGenerationRef.current = null;
        setError(err instanceof Error ? err.message : 'Could not start microphone capture.');
        setStatus('error');
        return false;
      }

      // Stop/unmount may happen while addModule() is pending. Do not let that
      // stale startup install a live tap or start recognition afterward.
      if (generation !== startGenerationRef.current) {
        tap.disconnect();
        return false;
      }
      tapRef.current = tap;

      let result;
      try {
        result = await window.electron.startStt();
      } catch (err) {
        if (generation !== startGenerationRef.current) {
          tap.disconnect();
          if (tapRef.current === tap) tapRef.current = null;
          return false;
        }
        pendingStartGenerationRef.current = null;
        setError(err instanceof Error ? err.message : 'Could not start speech recognition.');
        setStatus('error');
        stopFeeding();
        return false;
      }
      if (generation !== startGenerationRef.current) {
        tap.disconnect();
        if (tapRef.current === tap) tapRef.current = null;
        if (result.ok) await window.electron.stopStt();
        return false;
      }
      pendingStartGenerationRef.current = null;
      if (!result.ok) {
        setError(result.message ?? 'Could not start speech recognition.');
        setErrorCode(result.code ?? null);
        setStatus('error');
        stopFeeding();
        return false;
      }
      setProvider(result.provider ?? null);
      return true;
    },
    [stopFeeding],
  );

  const stop = useCallback(async () => {
    const shouldStop =
      statusRef.current !== 'idle' || tapRef.current !== null || pendingStartGenerationRef.current !== null;
    startGenerationRef.current += 1;
    pendingStartGenerationRef.current = null;
    if (!shouldStop) return;
    if (processingTimerRef.current) {
      window.clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    setStatus('stopping');
    stopFeeding();
    try {
      await window.electron.stopStt();
    } finally {
      setStatus('idle');
    }
  }, [stopFeeding]);

  /** Clear the accumulated final/partial transcript display (does not touch the session). */
  const clear = useCallback(() => {
    setFinalText('');
    setPartialText('');
  }, []);

  useEffect(() => {
    return () => {
      startGenerationRef.current += 1;
      pendingStartGenerationRef.current = null;
      stopFeeding();
      window.electron.stopStt().catch(() => undefined);
    };
  }, [stopFeeding]);

  return {
    status,
    partialText,
    finalText,
    clear,
    error,
    errorCode,
    provider,
    isActive,
    start,
    stop,
  };
}
