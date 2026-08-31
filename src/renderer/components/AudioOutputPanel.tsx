import React from "react";
import type { AudioOutputDevice, AudioOutputStatus } from "@shared/index";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Label } from "./ui/label";

interface AudioOutputPanelProps {
  status: AudioOutputStatus;
  devices: AudioOutputDevice[];
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
}

export default function AudioOutputPanel({
  status,
  devices,
  selectedDeviceId,
  onSelect,
}: AudioOutputPanelProps) {
  const variant =
    status === "active"
      ? "success"
      : status === "error"
        ? "destructive"
        : "muted";
  const label =
    status === "active"
      ? "Active"
      : status === "error"
        ? "Error"
        : "Off";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-[13px]">Audio Output</CardTitle>
        <Badge variant={variant} dot>
          {label}
        </Badge>
      </CardHeader>

      <CardContent className="p-4 pt-0">
        <div className="flex items-center gap-2">
          <Label htmlFor="output-device" className="text-xs">
            Device
          </Label>
          <div className="grow">
            <Select
              value={selectedDeviceId}
              onValueChange={onSelect}
              disabled={devices.length === 0}
            >
              <SelectTrigger id="output-device" aria-label="Output device">
                <SelectValue placeholder="No output device" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
