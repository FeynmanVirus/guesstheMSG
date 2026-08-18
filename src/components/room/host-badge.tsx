import { Crown } from "lucide-react";

export function HostBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-sun">
      <Crown className="size-3.5" aria-hidden />
      <span className="text-xs font-medium">host</span>
    </span>
  );
}
