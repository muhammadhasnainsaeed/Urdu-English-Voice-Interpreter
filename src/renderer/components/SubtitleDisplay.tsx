import React from "react";

interface SubtitleDisplayProps {
  label: string;
  icon: string;
  text: string;
  lang: "ur" | "en";
}

export default function SubtitleDisplay({ label, icon, text, lang }: SubtitleDisplayProps) {
  return (
    <div className={`subtitle-box subtitle-${lang}`} dir={lang === "ur" ? "rtl" : "ltr"}>
      <div className="subtitle-label">
        <span className="subtitle-icon">{icon}</span> {label}
      </div>
      <div className="subtitle-text">{text || "..."}</div>
    </div>
  );
}
