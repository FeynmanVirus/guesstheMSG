"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

// The chunky "physical button" CTA that appears on nearly every screen in
// the mockup: icon tile + title/subtitle + a trailing chevron, sitting on
// the .doodle-pop offset shadow. Renders a <Link> when `href` is given,
// otherwise a <button> — same look either way.
const ACCENT_BG: Record<string, string> = {
  sun: "bg-sun",
  coral: "bg-coral",
  sky: "bg-sky",
  sage: "bg-sage",
  lavender: "bg-lavender",
};

interface PopButtonBaseProps {
  accent: keyof typeof ACCENT_BG;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
}

interface PopButtonAsButton extends PopButtonBaseProps {
  href?: undefined;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}

interface PopButtonAsLink extends PopButtonBaseProps {
  href: string;
}

type PopButtonProps = PopButtonAsButton | PopButtonAsLink;

export function PopButton(props: PopButtonProps) {
  const { accent, icon, title, subtitle, className } = props;

  const classes = cn(
    "doodle-pop flex items-center gap-3.5 px-5 py-4 text-left disabled:pointer-events-none disabled:opacity-50",
    ACCENT_BG[accent],
    className,
  );

  const content = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-white/60 text-xl sm:size-12 sm:text-2xl">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-2xl leading-tight font-bold text-ink sm:text-[1.6rem]">
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-xs font-semibold text-ink/70 sm:text-[0.8rem]">
            {subtitle}
          </span>
        )}
      </span>
      <span className="text-2xl font-extrabold text-ink" aria-hidden>
        ›
      </span>
    </>
  );

  if (isLink(props)) {
    return (
      <Link href={props.href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type={props.type ?? "button"} onClick={props.onClick} disabled={props.disabled} className={classes}>
      {content}
    </button>
  );
}

// `href` alone (string | undefined on both branches) isn't a literal TS can
// discriminate on via truthiness — an explicit type predicate is.
function isLink(props: PopButtonProps): props is PopButtonAsLink {
  return typeof props.href === "string";
}
