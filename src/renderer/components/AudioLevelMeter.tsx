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
