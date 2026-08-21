// Category names are plain text in the DB (Movies, Food, Things, …) — no
// emoji baked in. This is a display-only lookup shared by the create-room
// form's chip row and the lobby header's settings summary; never sent to
// the server, never used to validate anything.
const CATEGORY_EMOJI: Record<string, string> = {
  Movies: "🎬",
  Food: "🍜",
  Things: "🧩",
  Country: "🌍",
};

/** `name` is null for the "mixed" sentinel (rooms.category_id is null). */
export function categoryLabel(name: string | null): string {
  if (name === null) return "🎲 Mixed";
  return `${CATEGORY_EMOJI[name] ?? "🗂️"} ${name}`;
}

export function categoryEmoji(name: string): string {
  return CATEGORY_EMOJI[name] ?? "🗂️";
}
