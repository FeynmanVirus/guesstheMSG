import { Wifi, WifiOff } from "lucide-react";

interface ConnectionIndicatorProps {
  connected: boolean;
}

// DESIGN.md §3 accessibility guardrail: never rely on color alone —
// connected/disconnected always carries an icon + a visible label, not just
// color. Labeled "ready"/"away" (mockup frame 1d's player-card vocabulary)
// rather than "connected"/"disconnected" — there's no backend ready-toggle
// yet, so a connected non-host player reading as "ready" is the honest
// approximation, not a claim about a real ready state.
export function ConnectionIndicator({ connected }: ConnectionIndicatorProps) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
        <Wifi className="size-3 text-sage" aria-hidden />
        ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
      <WifiOff className="size-3" aria-hidden />
      away
    </span>
  );
}
