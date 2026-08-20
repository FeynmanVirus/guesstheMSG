import { Avatar } from "@/components/doodle/avatar";
import { avatarFace } from "@/lib/avatars";
import { cn } from "@/lib/utils";

// The 3-bar top-3 podium — shared by the inline round recap (chat/leaderboard
// keep running behind it) and the end-of-game results screen. Each bar's
// fill reuses that player's own avatar accent, so the podium and the
// leaderboard/avatar read as the same person rather than an arbitrary color.
export interface PodiumEntry {
  playerId: string;
  avatarId: string;
  displayName: string;
  points: number;
}

const ACCENT_BG: Record<string, string> = {
  sage: "bg-sage",
  sun: "bg-sun",
  sky: "bg-sky",
  lavender: "bg-lavender",
  coral: "bg-coral",
};

const RANK_LABEL = ["1st", "2nd", "3rd"];
const RANK_HEIGHT = ["h-[124px]", "h-[82px]", "h-[60px]"];
// Podium entries arrive ranked 1st..3rd; the classic display order is
// 2nd–1st–3rd left to right.
const DISPLAY_ORDER = [1, 0, 2];

interface PodiumProps {
  entries: PodiumEntry[];
  className?: string;
}

export function Podium({ entries, className }: PodiumProps) {
  return (
    <div className={cn("flex w-full items-end gap-3", className)}>
      {DISPLAY_ORDER.map((rank) => {
        const entry = entries[rank];
        if (!entry) return null;
        const { accent } = avatarFace(entry.avatarId);
        return (
          <div key={entry.playerId} className="flex flex-1 flex-col items-center gap-1.5">
            <Avatar avatarId={entry.avatarId} className="size-14 text-2xl sm:size-16 sm:text-3xl" />
            <p className="max-w-full truncate font-heading text-lg font-bold text-ink">
              {entry.displayName}
            </p>
            <div
              className={cn(
                "flex w-full flex-col items-center gap-0.5 rounded-t-xl border-2 border-b-0 border-ink pt-2",
                RANK_HEIGHT[rank],
                ACCENT_BG[accent],
              )}
            >
              <span className="font-heading text-xl font-bold text-ink">{RANK_LABEL[rank]}</span>
              <span className="text-lg font-extrabold text-ink">{entry.points}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
