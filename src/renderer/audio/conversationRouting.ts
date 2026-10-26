/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */
import type { ConversationSettings } from '@shared/index';

type Device = Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'kind' | 'label'>;
const explicit = (id: string | null) => !!id && !['default', 'communications', 'blackhole'].includes(id);
const virtual = (device: Device) => /blackhole|loopback|soundflower|virtual|vb.?cable/i.test(device.label);

function sameDevice(a: Device, b: Device): boolean {
  return (
    a.deviceId === b.deviceId ||
    (!!a.groupId && a.groupId === b.groupId) ||
    (!!a.label && a.label.trim().toLowerCase() === b.label.trim().toLowerCase())
  );
}

/** Input and output ids differ for the same virtual cable; compare hardware groups/labels too. */
export function validateConversationRouting(
  settings: ConversationSettings,
  devices: readonly Device[],
  microphoneId: string | null,
  outgoingId: string,
): string | null {
  if (!settings.incomingEnabled) return null;
  if (
    !explicit(settings.incomingDeviceId) ||
    !explicit(settings.listeningDeviceId) ||
    !explicit(outgoingId)
  ) {
    return 'For two-way translation, select two separate audio cables and an explicit headphones output. System Default can create an audio loop.';
  }
  const incoming = devices.find((d) => d.kind === 'audioinput' && d.deviceId === settings.incomingDeviceId);
  const outgoing = devices.find((d) => d.kind === 'audiooutput' && d.deviceId === outgoingId);
  const listening = devices.find(
    (d) => d.kind === 'audiooutput' && d.deviceId === settings.listeningDeviceId,
  );
  const microphone = devices.find((d) => d.kind === 'audioinput' && d.deviceId === microphoneId);
  if (!incoming || !outgoing || !listening)
    return 'An audio device is unavailable. Reconnect it and select it again.';
  if (!virtual(incoming) || !virtual(outgoing))
    return 'Select virtual audio cables for client audio and meeting voice output (for example, BlackHole 16ch and BlackHole 2ch).';
  if (sameDevice(incoming, outgoing))
    return 'Client audio and meeting voice output must use different virtual cables (for example, BlackHole 16ch and BlackHole 2ch).';
  if (virtual(listening) || sameDevice(listening, incoming) || sameDevice(listening, outgoing))
    return 'Select your physical headphones for the translated client voice.';
  if (!microphone || virtual(microphone) || sameDevice(microphone, incoming))
    return 'Select your physical microphone in Settings so your voice stays separate from the client audio.';
  return null;
}
