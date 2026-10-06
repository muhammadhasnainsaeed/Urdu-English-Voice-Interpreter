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

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranscript } from '../services/useTranscript';
import type { SessionEvent, SttEvent } from '@shared/index';

const MAX_VISIBLE_ENTRIES = 4;

const DRAG: React.CSSProperties = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/**
 * Floating subtitle overlay (`#overlay` window).
 *
 * Deliberately does NOT mount `App`: the overlay only listens to the
 * stt/translation/session broadcast channels and renders captions. It never
 * owns microphone capture, TTS, or session lifecycle — those stay in the
 * main window.
 */
export default function OverlayScreen() {
  const { entries } = useTranscript();
  const [partialText, setPartialText] = useState('');
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const offStt = window.electron.onSttEvent((event: SttEvent) => {
      if (event.type === 'partial') setPartialText(event.text);
      else if (event.type === 'final' || event.type === 'stopped') setPartialText('');
    });
    const offSession = window.electron.onSessionEvent((event: SessionEvent) => {
      if (event.type === 'session:status') setListening(event.stages.stt === 'listening');
    });
    return () => {
      offStt();
      offSession();
    };
  }, []);

  const visible = entries.slice(-MAX_VISIBLE_ENTRIES);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible, partialText]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-black/75 text-white shadow-2xl backdrop-blur"
      data-testid="overlay-screen"
    >
      {/* Drag strip + status + close. The strip is the only move affordance
          (the window is frameless and non-focusable). */}
      <header
        className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 select-none"
        style={DRAG}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block size-2 rounded-full ${listening ? 'bg-emerald-400' : 'bg-white/30'}`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium tracking-wide text-white/70">Live captions</span>
        </div>
        <button
          type="button"
          onClick={() => {
            void window.electron.closeOverlay();
          }}
          className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          style={NO_DRAG}
          aria-label="Close captions overlay"
        >
          <X className="size-3.5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        {visible.length === 0 && !partialText ? (
          <p className="py-4 text-center text-xs text-white/40">Waiting for speech…</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((entry) => (
              <li key={entry.id}>
                <div className="textbox-urdu leading-snug text-white" dir="rtl" style={{ fontSize: '17px' }}>
                  {entry.urdu}
                </div>
                {entry.english ? (
                  <div className="mt-0.5 text-[13px] leading-snug text-white/75">{entry.english}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {partialText ? (
          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="textbox-urdu text-white/60 italic" dir="rtl" style={{ fontSize: '15px' }}>
              {partialText}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
