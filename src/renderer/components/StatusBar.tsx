import React from "react";
import { ApplicationStatus } from "@shared/index";

interface StatusBarProps {
  status: ApplicationStatus;
  latency?: number;
}

export default function StatusBar({ status, latency }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div>
        <span className="status-label">Status:</span>{" "}
        <span className={`status-value status-${status}`}>{status}</span>
      </div>
      <div>
        <span className="status-label">Latency:</span>{" "}
        <span className="status-value">{latency != null ? `${latency}s` : "—"}</span>
      </div>
    </div>
  );
}
