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

import * as React from 'react';
import { Disc, MicOff, Pause, Play, Trash2 } from 'lucide-react';
import type { ApplicationStatus, AudioDevice, PermissionStatus } from '@shared/index';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert } from './ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './ui/command';
import { LiveWaveform } from './ui/live-waveform';
import { cn } from '@/lib/utils';

/**
 * Microphone card styled after the ElevenLabs UI `mic-selector` DevLab demo:
 * a live waveform, a microphone device selector, and a record / pause / play /
 * trash sound-check control row. It is a device-test surface only — the
 * meeting pipeline owns real capture, so this reuses a SINGLE sound-check
 * stream (the `LiveWaveform` stream is handed to the recorder via
 * `onStreamReady`) rather than opening duplicate microphone streams.
 *
 * The ElevenLabs registry is rate-limited in this environment, so — consistent
 * with the vendored `LiveWaveform` and the custom `VoicePicker` — the demo UI
 * is recreated locally and wired to the existing `useMicrophone` device state.
 */

type CheckState = 'idle' | 'recording' | 'recorded' | 'playing';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  idle: 'Idle',
  'requesting-permission': 'Requesting…',
  ready: 'Ready',
  listening: 'Listening',
  processing: 'Processing',
  speaking: 'Speaking',
  error: 'Error',
};

function statusBadge(status: ApplicationStatus) {
  const variant =
    status === 'listening'
      ? 'success'
      : status === 'error'
        ? 'destructive'
        : status === 'requesting-permission'
          ? 'warning'
          : 'muted';
  return (
    <Badge variant={variant} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

interface MicSelectorProps {
  permission: PermissionStatus;
  status: ApplicationStatus;
  devices: AudioDevice[];
  selectedDeviceId: string | null;
  error: string | null;
  onSelectDevice: (deviceId: string) => void;
}

export default function MicSelector({
  permission,
  status,
  devices,
  selectedDeviceId,
  error,
  onSelectDevice,
}: MicSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [checkState, setCheckState] = React.useState<CheckState>('idle');
  const [isMuted, setIsMuted] = React.useState(false);

  const streamRef = React.useRef<MediaStream | null>(null);
  const captureCtxRef = React.useRef<AudioContext | null>(null);
  const scriptProcessorRef = React.useRef<ScriptProcessorNode | null>(null);
  const pcmAccumRef = React.useRef<number[]>([]);

  const pcmRef = React.useRef<Float32Array | null>(null);
  const sampleRateRef = React.useRef(24000);
  const playheadRef = React.useRef(0);
  const playCtxRef = React.useRef<AudioContext | null>(null);
  const playSourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const pollTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const selected = devices.find((d) => d.deviceId === selectedDeviceId) ?? null;
  const recording = checkState === 'recording';

  const teardownCapture = React.useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (captureCtxRef.current && captureCtxRef.current.state !== 'closed') {
      captureCtxRef.current.close().catch(() => undefined);
    }
    captureCtxRef.current = null;
  }, []);

  const teardownPlayback = React.useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    try {
      playSourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    playSourceRef.current = null;
    if (playCtxRef.current && playCtxRef.current.state !== 'closed') {
      playCtxRef.current.close().catch(() => undefined);
    }
    playCtxRef.current = null;
  }, []);

  // The LiveWaveform opens the selected-device stream (single capture). When
  // it becomes ready we tap the same stream with a ScriptProcessorNode to
  // capture sequential, non-overlapping PCM frames — the only format this
  // AVMedia build can play back through createBufferSource.
  const handleStreamReady = React.useCallback(
    (stream: MediaStream) => {
      streamRef.current = stream;
      pcmAccumRef.current = [];
      teardownPlayback();
      teardownCapture();
      try {
        const ctx = new AudioContext({ sampleRate: 24000 });
        captureCtxRef.current = ctx;
        sampleRateRef.current = ctx.sampleRate;
        const source = ctx.createMediaStreamSource(stream);
        const bufferSize = 4096;
        const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
        scriptProcessorRef.current = processor;

        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          const input = e.inputBuffer.getChannelData(0);
          for (let i = 0; i < input.length; i++) {
            pcmAccumRef.current.push(input[i]);
          }
        };

        source.connect(processor);
        processor.connect(ctx.destination);
        setCheckState('recording');
      } catch {
        teardownCapture();
        setCheckState('idle');
      }
    },
    [teardownCapture, teardownPlayback],
  );

  // Whenever the waveform tears its stream down (stop/mute/unmount), stop the
  // capture, seal the PCM clip, and release the mic tracks. Guard against
  // duplicate calls (the LiveWaveform cleanup fires its own onStreamEnd after
  // we tear the stream down here) by only finalising when still recording.
  const handleStreamEnd = React.useCallback(() => {
    if (scriptProcessorRef.current === null) return;
    teardownCapture();
    pcmRef.current = new Float32Array(pcmAccumRef.current);
    pcmAccumRef.current = [];
    if (pcmRef.current.length === 0) {
      setCheckState('idle');
      return;
    }
    playheadRef.current = 0;
    setCheckState('recorded');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [teardownCapture]);

  const startCheck = React.useCallback(() => {
    if (isMuted || devices.length === 0 || permission !== 'granted') return;
    pcmRef.current = null;
    pcmAccumRef.current = [];
    playheadRef.current = 0;
    teardownPlayback();
    setIsMuted(false);
    setCheckState('recording');
  }, [devices, isMuted, permission, teardownPlayback]);

  const playRecording = React.useCallback(() => {
    if (!pcmRef.current || checkState !== 'recorded') return;
    teardownPlayback();
    const sr = sampleRateRef.current;
    if (playheadRef.current >= pcmRef.current.length) playheadRef.current = 0;
    const offset = playheadRef.current;
    const remaining = pcmRef.current.length - offset;
    if (remaining <= 0) return;

    try {
      const ctx = new AudioContext({ sampleRate: sr });
      playCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
      const buf = ctx.createBuffer(1, remaining, sr);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < remaining; i++) ch[i] = pcmRef.current[offset + i];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      playSourceRef.current = src;

      src.onended = () => {
        playheadRef.current = pcmRef.current?.length ?? 0;
        teardownPlayback();
        setCheckState('recorded');
      };

      src.start();
      setCheckState('playing');

      const tickMs = 30;
      let lastTick = Date.now();
      pollTimerRef.current = setInterval(() => {
        const now = Date.now();
        playheadRef.current += ((now - lastTick) / 1000) * sr;
        lastTick = now;
        if (pcmRef.current && playheadRef.current >= pcmRef.current.length) {
          playheadRef.current = pcmRef.current.length;
          teardownPlayback();
          setCheckState('recorded');
        }
      }, tickMs);
    } catch {
      teardownPlayback();
      setCheckState('recorded');
    }
  }, [checkState, teardownPlayback]);

  const pausePlayback = React.useCallback(() => {
    teardownPlayback();
    setCheckState('recorded');
  }, [teardownPlayback]);

  const restart = React.useCallback(() => {
    teardownPlayback();
    teardownCapture();
    pcmRef.current = null;
    pcmAccumRef.current = [];
    playheadRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCheckState('idle');
  }, [teardownPlayback, teardownCapture]);

  // Cleanup on unmount: stop playback/recording + release mic tracks.
  React.useEffect(() => {
    return () => {
      teardownPlayback();
      teardownCapture();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [teardownPlayback, teardownCapture]);

  const showProcessing = checkState === 'playing';
  const showRecorded = checkState === 'recorded';

  const controlsDisabled = devices.length === 0 || permission !== 'granted';

  return (
    <Card className="m-0 w-full border p-0 shadow-none">
      <CardHeader className="p-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <CardTitle className="text-[13px]">Microphone</CardTitle>
          {statusBadge(status)}
        </div>
      </CardHeader>

      <CardContent className="flex w-full flex-wrap items-center justify-between gap-2 p-2">
        <div className="h-8 w-full min-w-0 flex-1 md:w-[200px] md:flex-none">
          <div
            className={cn(
              'flex h-full items-center gap-2 rounded-md py-1',
              'bg-foreground/5 text-foreground/70',
            )}
          >
            <div className="h-full min-w-0 flex-1">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-sm">
                <LiveWaveform
                  active={recording && !isMuted}
                  processing={showProcessing}
                  deviceId={selectedDeviceId ?? undefined}
                  barWidth={3}
                  barGap={1}
                  barRadius={4}
                  fadeEdges
                  fadeWidth={24}
                  sensitivity={1.8}
                  smoothingTimeConstant={0.85}
                  height={20}
                  mode="scrolling"
                  onStreamReady={handleStreamReady}
                  onStreamEnd={handleStreamEnd}
                  className={cn(
                    'h-full w-full transition-opacity duration-300',
                    checkState === 'idle' && 'opacity-0',
                  )}
                />
                {checkState === 'idle' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-medium text-foreground/50">Sound check</span>
                  </div>
                )}
                {showRecorded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-medium text-foreground/50">Ready to Play</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-1 md:w-auto">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                role="combobox"
                aria-expanded={open}
                disabled={devices.length === 0 || recording}
                title={selected ? selected.label : 'No microphone found'}
                className="h-9 max-w-[160px] justify-start gap-1 px-2 text-sm font-normal text-foreground/70"
              >
                <MicGlyph className="size-5" />
                <span className="truncate">{selected ? selected.label : 'Select mic'}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[var(--radix-popover-trigger-width)] p-0"
            >
              <Command>
                <CommandList>
                  <CommandEmpty>No microphone found.</CommandEmpty>
                  <CommandGroup>
                    {devices.map((device) => (
                      <CommandItem
                        key={device.deviceId}
                        value={device.label}
                        onSelect={() => {
                          onSelectDevice(device.deviceId);
                          setOpen(false);
                        }}
                        className="flex items-center gap-3"
                      >
                        <MicGlyph className="size-5" />
                        <span className="min-w-0 flex-1 truncate">{device.label}</span>
                        <svg
                          className={cn(
                            'ml-auto size-4 shrink-0',
                            selectedDeviceId === device.deviceId ? 'opacity-100' : 'opacity-0',
                          )}
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden
                        >
                          <path
                            d="M3.5 8.5l2.5 2.5 6-6.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMuted((m) => !m)}
            disabled={controlsDisabled}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            <MicOff className={cn('size-5', isMuted ? 'opacity-100' : 'opacity-40')} />
          </Button>

          <Separator orientation="vertical" className="mx-1 -my-2.5" />

          <div className="flex">
            {checkState === 'idle' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={startCheck}
                disabled={controlsDisabled || isMuted}
                title="Start a microphone sound check"
                aria-label="Start sound check"
              >
                <Disc className="size-5" />
              </Button>
            )}
            {recording && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStreamEnd}
                title="Stop sound check"
                aria-label="Stop sound check"
              >
                <Pause className="size-5" />
              </Button>
            )}
            {showRecorded && (
              <Button
                variant="ghost"
                size="icon"
                onClick={playRecording}
                title="Play recording"
                aria-label="Play recording"
              >
                <Play className="size-5" />
              </Button>
            )}
            {checkState === 'playing' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={pausePlayback}
                title="Pause playback"
                aria-label="Pause playback"
              >
                <Pause className="size-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={restart}
              disabled={checkState === 'idle' || checkState === 'playing'}
              title="Delete recording"
              aria-label="Delete recording"
            >
              <Trash2 className="size-5" />
            </Button>
          </div>
        </div>
      </CardContent>

      {error && <Alert variant="destructive">{error}</Alert>}

      {permission === 'denied' && (
        <Alert variant="warning">
          Enable microphone access in System Settings → Privacy &amp; Security → Microphone, then restart the
          app.
        </Alert>
      )}
    </Card>
  );
}

function MicGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#CADCFC] to-[#A0B9D1]',
        className,
      )}
    >
      <svg
        className="h-[60%] w-[60%]"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
        <path
          d="M5 11a7 7 0 0 0 14 0M12 18v3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
