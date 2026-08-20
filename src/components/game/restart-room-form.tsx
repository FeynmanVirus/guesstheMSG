"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/doodle/chip";
import { PopButton } from "@/components/doodle/pop-button";
import { FormError } from "@/components/home/form-error";
import { supabase } from "@/lib/supabase/client";
import { callFunction } from "@/lib/api";
import { categoryEmoji } from "@/lib/categories";
import { parseCustomWords } from "@shared/custom-words";
import { MIXED_CATEGORY_ID } from "@shared/categories";

interface RestartRoomFormProps {
  roomCode: string;
}

interface Category {
  id: string;
  name: string;
}

// Host-only, shown on the results screen (DESIGN.md §2.8, mockup frame
// 1h): change the category and/or edit the custom word list, then restart
// in the same room — no re-join, no re-picking names/avatars. restart-room
// only accepts { roomCode, categoryId, customWords } — rounds/seconds carry
// over from the room's existing settings unchanged, so there's no
// stepper/time-chip row here the way there is on create-room-form.tsx.
//
// On success, this does nothing further — Realtime flips rooms.status to
// 'in_progress' and room-lobby.tsx's existing branch swaps the screen to
// RoomGame, the same contract start-game-button.tsx already relies on.
export function RestartRoomForm({ roomCode }: RestartRoomFormProps) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [customWords, setCustomWords] = useState("");
  const [draft, setDraft] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // No ensureAnonSession() here (unlike create-room-form.tsx) — being on
  // this room's results screen already proves a live session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name")
        .is("room_id", null)
        .order("name");
      if (!cancelled && data) {
        setCategories(data);
        if (data.length > 0) setCategoryId((prev) => prev || data[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const customWordsPreview = useMemo(() => parseCustomWords(customWords), [customWords]);

  const categoryOptions = useMemo(
    () => [
      { id: MIXED_CATEGORY_ID, name: "Mixed", emoji: "🎲" },
      ...(categories ?? []).map((c) => ({ ...c, emoji: categoryEmoji(c.name) })),
    ],
    [categories],
  );

  function addWord() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setCustomWords((prev) => (prev.trim() ? `${prev}, ${trimmed}` : trimmed));
    setDraft("");
  }

  function removeWord(index: number) {
    const next = customWordsPreview.pairs.filter((_, i) => i !== index);
    setCustomWords(next.map((p) => `${p.emojiSequence}: ${p.answer}`).join(", "));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const result = await callFunction("restart-room", {
        roomCode,
        categoryId,
        customWords: customWords || null,
      });

      if (!result.ok) {
        setError(result.error.message);
        if (result.error.fields) setFieldErrors(result.error.fields);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormError message={error} />

      <div className="space-y-2">
        <Label className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
          Category
        </Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
          {categoryOptions.map((c) => (
            <Chip
              key={c.id}
              accent="sage"
              selected={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              role="radio"
              aria-checked={categoryId === c.id}
            >
              {c.emoji} {c.name}
            </Chip>
          ))}
        </div>
        {fieldErrors.categoryId && <p className="text-sm text-coral">{fieldErrors.categoryId}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label
            htmlFor="restart-word-draft"
            className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase"
          >
            Custom words <span className="normal-case">(optional)</span>
          </Label>
          <p className="text-xs font-semibold text-ink-muted">
            {customWordsPreview.pairs.length} added
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border-[2.5px] border-ink bg-surface px-3.5 py-1 shadow-panel focus-within:ring-2 focus-within:ring-sky">
          <input
            id="restart-word-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addWord();
              }
            }}
            placeholder="🦁👑: the lion king"
            className="h-11 min-w-0 flex-1 bg-transparent font-bold text-ink outline-none placeholder:font-semibold placeholder:text-placeholder"
          />
          <button
            type="button"
            onClick={addWord}
            className="shrink-0 rounded-full border-2 border-ink bg-sun px-3.5 py-1.5 text-xs font-bold text-ink"
          >
            add
          </button>
        </div>

        {customWordsPreview.pairs.length > 0 && (
          <div className="doodle-dashed flex flex-wrap gap-2 p-3.5">
            {customWordsPreview.pairs.map((pair, i) => (
              <span
                key={`${pair.answer}-${i}`}
                className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-3 py-1.5 text-sm font-semibold text-ink"
              >
                {pair.answer}
                <button
                  type="button"
                  onClick={() => removeWord(i)}
                  aria-label={`Remove ${pair.answer}`}
                  className="text-ink-muted"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}

        <p className="text-sm text-ink-muted">
          Replaces the last game&apos;s custom words. Leave blank to use category words only.
        </p>
        {customWordsPreview.errors.length > 0 && (
          <p className="text-sm text-coral">
            {customWordsPreview.errors.length} problem
            {customWordsPreview.errors.length === 1 ? "" : "s"} in what you typed — check the
            emoji:answer format.
          </p>
        )}
        {fieldErrors.customWords && <p className="text-sm text-coral">{fieldErrors.customWords}</p>}
      </div>

      <PopButton
        accent="sage"
        icon={<Play className="size-5" aria-hidden />}
        title={submitting ? "Starting…" : "Start rematch"}
        type="submit"
        disabled={submitting}
        className="w-full"
      />
    </form>
  );
}
