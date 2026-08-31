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

import React from "react";
import { Progress } from "./ui/progress";

interface AudioLevelMeterProps {
  level: number;
}

export default function AudioLevelMeter({ level }: AudioLevelMeterProps) {
  const normalized = Math.max(0, Math.min(1, level));

  return (
    <div className="flex items-center gap-2">
      <div className="grow">
        <Progress
          value={normalized * 100}
          aria-label={`Audio level ${Math.round(normalized * 100)}%`}
        />
      </div>
      <span className="min-w-8 text-right text-xs text-muted-foreground">
        {Math.round(normalized * 100)}%
      </span>
    </div>
  );
}
