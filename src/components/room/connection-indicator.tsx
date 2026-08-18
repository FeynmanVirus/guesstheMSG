import { Wifi, WifiOff } from "lucide-react";

interface ConnectionIndicatorProps {
  connected: boolean;
}

// DESIGN.md §3 accessibility guardrail: never rely on color alone —
// connected/disconnected is always carried by an icon + a visible or
// screen-reader label, not just the dot's color.
export function ConnectionIndicator({ connected }: ConnectionIndicatorProps) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 text-sage">
        <Wifi className="size-3.5" aria-hidden />
        <span className="sr-only">connected</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      <WifiOff className="size-3.5" aria-hidden />
      <span className="text-xs">disconnected</span>
    </span>
  );
}
