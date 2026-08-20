import { cn } from "@/lib/utils";
import { avatarFace, type AvatarId } from "@/lib/avatars";

// Emoji-on-a-colored-circle avatars (DESIGN.md §3) — replaces the old
// DiceBear <Image> + avatarSrc() call sites. Size/font-size are the caller's
// job via `className` (e.g. "size-12 text-2xl"); this only owns the shape,
// border, and accent fill so every avatar in the app reads as one system.
const ACCENT_BG: Record<string, string> = {
  sage: "bg-sage",
  sun: "bg-sun",
  sky: "bg-sky",
  lavender: "bg-lavender",
  coral: "bg-coral",
};

interface AvatarProps {
  avatarId: AvatarId | string;
  className?: string;
  /** The mockup's "selected" double-ring, e.g. the avatar-picker tile. */
  selected?: boolean;
}

export function Avatar({ avatarId, className, selected }: AvatarProps) {
  const { emoji, accent } = avatarFace(avatarId);
  return (
    <div
      role="img"
      aria-label="Player avatar"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-ink text-lg leading-none",
        ACCENT_BG[accent],
        selected && "shadow-[0_0_0_3px_var(--color-paper),0_0_0_5.5px_var(--color-ink)]",
        className,
      )}
    >
      <span aria-hidden>{emoji}</span>
    </div>
  );
}
