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

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OverlayScreen from './pages/OverlayScreen';
import { ThemeProvider } from './components/theme-provider';
import { ErrorProvider } from './errors/ErrorProvider';

// The floating caption window loads the same bundle with `#overlay`.
// It renders a standalone screen (never `App`) so it can't capture the
// microphone or own session lifecycle, and it clears the page background so
// the transparent BrowserWindow shows the meeting underneath.
const isOverlay = window.location.hash === '#overlay';
if (isOverlay) {
  document.body.classList.add('overlay-mode');
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorProvider>
        <ThemeProvider>{isOverlay ? <OverlayScreen /> : <App />}</ThemeProvider>
      </ErrorProvider>
    </React.StrictMode>,
  );
}
