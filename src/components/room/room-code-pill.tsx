"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface RoomCodePillProps {
  code: string;
}

// The lobby header's room-code chip (mockup frame 1d) — copies the bare
// code (e.g. "FOX-482") to the clipboard, not a share link; the "invite a
// friend" tile in player-list.tsx covers the link/QR case separately.
export function RoomCodePill({ code }: RoomCodePillProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked (permissions, insecure context) —
      // failing silently on a nice-to-have beats throwing.
    }
  }

  return (
    <div className="flex items-center gap-2.5 rounded-full border-[2.5px] border-ink bg-surface py-2 pr-2 pl-4 shadow-panel">
      <span className="text-xs font-semibold text-ink-muted">code</span>
      <span className="font-heading text-2xl font-bold tracking-[0.16em] text-ink">{code}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="flex shrink-0 items-center gap-1 rounded-full border-2 border-ink bg-sage px-3 py-1.5 text-xs font-bold text-ink"
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
