import React from "react";

interface AudioLevelMeterProps {
  level: number;
}

const BLOCKS = 10;

export default function AudioLevelMeter({ level }: AudioLevelMeterProps) {
  const normalized = Math.max(0, Math.min(1, level));
  const filled = Math.round(normalized * BLOCKS);

  return (
    <div className="level-meter">
      <div className="level-blocks" aria-label={`Audio level ${Math.round(normalized * 100)}%`}>
        {Array.from({ length: BLOCKS }).map((_, i) => (
          <span
            key={i}
            className={`level-block${i < filled ? " filled" : ""}`}
          />
        ))}
      </div>
      <span className="level-percent">{Math.round(normalized * 100)}%</span>
    </div>
  );
}
