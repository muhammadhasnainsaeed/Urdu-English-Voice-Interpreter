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
import type { TtsVoice } from '@shared/index';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';

interface VoicePickerProps {
  voices: TtsVoice[];
  value: string | null;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** A searchable combobox that lists every available TTS voice (no gender filter). */
export default function VoicePicker({ voices, value, onChange, disabled, placeholder }: VoicePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = voices.find((v) => v.id === value) ?? null;

  const triggerLabel = selected?.name ?? placeholder ?? 'Select a voice';
  const triggerMeta = selected?.source === 'system' ? '(macOS)' : null;

  const azure = voices.filter((v) => v.source === 'azure');
  const system = voices.filter((v) => v.source === 'system');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || voices.length === 0}
          className="flex h-8 w-full items-center justify-between px-3 text-sm font-normal"
        >
          <span className="truncate">
            {selected?.name ?? triggerLabel}
            {triggerMeta && <span className="ml-1 text-muted-foreground/60">{triggerMeta}</span>}
          </span>
          <svg
            className="ml-2 h-4 w-4 shrink-0 opacity-50"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search voices…" />
          <CommandList>
            <CommandEmpty>No voice found</CommandEmpty>
            {azure.length > 0 && (
              <CommandGroup heading="Azure voices">
                {azure.map((voice) => (
                  <CommandItem
                    key={voice.id}
                    value={`${voice.name} ${voice.id}`}
                    onSelect={() => {
                      onChange(voice.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 truncate">{voice.name}</span>
                    {voice.id === value && (
                      <svg
                        className="h-4 w-4 shrink-0 text-foreground"
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
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {system.length > 0 && (
              <CommandGroup heading="macOS system voices">
                {system.map((voice) => (
                  <CommandItem
                    key={voice.id}
                    value={`${voice.name} ${voice.id}`}
                    onSelect={() => {
                      onChange(voice.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 truncate">{voice.name}</span>
                    {voice.id === value && (
                      <svg
                        className="h-4 w-4 shrink-0 text-foreground"
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
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
