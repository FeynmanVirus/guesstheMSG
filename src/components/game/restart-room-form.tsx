"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/components/home/form-error";
import { supabase } from "@/lib/supabase/client";
import { callFunction } from "@/lib/api";
import { parseCustomWords } from "@shared/custom-words";
import { MIXED_CATEGORY_ID } from "@shared/categories";

interface RestartRoomFormProps {
  roomCode: string;
}

interface Category {
  id: string;
  name: string;
}

// Host-only, shown on the results screen (DESIGN.md §2.8): change the
// category and/or edit the custom word list, then restart in the same
// room — no re-join, no re-picking names/avatars. A trimmed create-room-
// form.tsx: same category-select + custom-words patterns, minus room name/
// password/rounds/seconds, which restart-room doesn't touch.
//
// On success, this does nothing further — Realtime flips rooms.status to
// 'in_progress' and room-lobby.tsx's existing branch swaps the screen to
// RoomGame, the same contract start-game-button.tsx already relies on.
export function RestartRoomForm({ roomCode }: RestartRoomFormProps) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [customWords, setCustomWords] = useState("");

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
      { id: MIXED_CATEGORY_ID, name: "🎲 Mixed (all categories)" },
      ...(categories ?? []),
    ],
    [categories],
  );

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

      <div className="space-y-1.5">
        <Label htmlFor="restart-category">Category</Label>
        <Select
          items={categoryOptions.map((c) => ({ value: c.id, label: c.name }))}
          value={categoryId}
          onValueChange={(v) => setCategoryId(v ?? "")}
        >
          <SelectTrigger id="restart-category" className="w-full">
            <SelectValue placeholder={categories === null ? "Loading…" : "Choose a category"} />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.categoryId && (
          <p className="text-sm text-coral">{fieldErrors.categoryId}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="restart-custom-words">Custom words (optional)</Label>
        <Textarea
          id="restart-custom-words"
          value={customWords}
          onChange={(e) => setCustomWords(e.target.value)}
          placeholder="🦁👑: the lion king, 🍕: pizza"
          rows={3}
        />
        <p className="text-sm text-ink-muted">
          Replaces the last game&apos;s custom words. Leave blank to use category words only.
        </p>
        <p className="text-sm text-ink-muted">
          {customWordsPreview.pairs.length} pair
          {customWordsPreview.pairs.length === 1 ? "" : "s"}
          {customWordsPreview.errors.length > 0 &&
            ` · ${customWordsPreview.errors.length} problem${
              customWordsPreview.errors.length === 1 ? "" : "s"
            } (fix before submitting)`}
        </p>
        {fieldErrors.customWords && (
          <p className="text-sm text-coral">{fieldErrors.customWords}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="doodle-btn w-full bg-sun text-ink hover:bg-sun/90"
      >
        {submitting ? "Starting…" : "Play again"}
      </Button>
    </form>
  );
}
