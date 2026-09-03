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
import { cn } from '@/lib/utils';

/**
 * Searchable voice picker styled after the ElevenLabs UI `voice-picker`
 * (combobox trigger with a voice avatar + name, and a searchable list where
 * each voice shows a round glyph, its name, and a metadata line
 * `gender • country • source`, with a check on the selected voice). It uses the
 * project's own `TtsVoice[]` data (Azure + macOS system voices). Search matches
 * any facet — voice name, gender, country, and source.
 */

/** A small CSS round "voice" glyph that stands in for the ElevenLabs WebGL orb. */
function VoiceGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#CADCFC] to-[#A0B9D1]',
        className,
      )}
    >
      <svg
        className="h-[55%] w-[55%] text-primary-foreground"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <circle cx="12" cy="8.5" r="3.25" fill="currentColor" />
        <path
          d="M5.5 18.5c.6-3 3-4.5 6.5-4.5s5.9 1.5 6.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

const GENDER_LABELS: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  unknown: 'System',
};

const SOURCE_LABELS: Record<string, string> = {
  azure: 'Azure',
  system: 'macOS',
};

interface VoicePickerProps {
  voices: TtsVoice[];
  value: string | null;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function VoicePicker({
  voices,
  value,
  onChange,
  disabled,
  placeholder = 'Select a voice...',
}: VoicePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = voices.find((v) => v.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || voices.length === 0}
          className={cn('w-full justify-between px-3 font-normal')}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2 overflow-hidden">
              <VoiceGlyph className="size-6" />
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <svg
            className="ml-2 size-4 shrink-0 opacity-50"
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
          <CommandInput placeholder="Search by name, gender, country…" />
          <CommandList>
            <CommandEmpty>No voice found.</CommandEmpty>
            <CommandGroup>
              {voices.map((voice) => (
                <VoicePickerItem
                  key={voice.id}
                  voice={voice}
                  isSelected={value === voice.id}
                  onSelect={() => {
                    onChange(voice.id);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface VoicePickerItemProps {
  voice: TtsVoice;
  isSelected: boolean;
  onSelect: () => void;
}

function VoicePickerItem({ voice, isSelected, onSelect }: VoicePickerItemProps) {
  // cmdk `keywords` drive case-insensitive search across every facet a user
  // might type: the voice name, its gender, country, and source.
  const keywords = [
    voice.name,
    GENDER_LABELS[voice.gender] ?? voice.gender,
    voice.country,
    SOURCE_LABELS[voice.source] ?? voice.source,
    voice.id,
  ].filter((k): k is string => Boolean(k));

  const detail = [
    GENDER_LABELS[voice.gender] ?? voice.gender,
    voice.country ? voice.country.toUpperCase() : undefined,
    SOURCE_LABELS[voice.source] ?? voice.source,
  ].filter((k): k is string => Boolean(k));

  return (
    <CommandItem
      value={voice.name}
      keywords={keywords}
      onSelect={onSelect}
      className="flex items-center gap-3"
    >
      <VoiceGlyph className="size-8" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{voice.name}</span>
        {detail.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {detail.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span>•</span>}
                <span className="capitalize">{part}</span>
              </React.Fragment>
            ))}
          </span>
        )}
      </div>
      <svg
        className={cn('ml-auto size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
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
  );
}
