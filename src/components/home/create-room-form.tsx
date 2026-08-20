"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, PartyPopper } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip } from "@/components/doodle/chip";
import { Stepper } from "@/components/doodle/stepper";
import { PopButton } from "@/components/doodle/pop-button";
import { FormError } from "@/components/home/form-error";
import { supabase, ensureAnonSession } from "@/lib/supabase/client";
import { callFunction } from "@/lib/api";
import { saveIdentity, saveRoomCode } from "@/lib/identity";
import type { AvatarId } from "@/lib/avatars";
import { parseCustomWords } from "@shared/custom-words";
import { SETTINGS_BOUNDS } from "@shared/settings";
import { MIXED_CATEGORY_ID } from "@shared/categories";

interface CreateRoomFormProps {
  displayName: string;
  avatarId: AvatarId;
}

interface Category {
  id: string;
  name: string;
}

interface CreateRoomData {
  roomCode: string;
}

// Category names are plain text in the DB (no emoji baked in, unlike the
// mockup's chip labels) — this is purely a display lookup, never sent to
// the server. Anything not in the map falls back to a generic tile.
const CATEGORY_EMOJI: Record<string, string> = {
  Movies: "🎬",
  Food: "🍜",
  Things: "🧩",
};

// Time/round chips match SETTINGS_BOUNDS.secondsPerRound's min/default/max
// exactly — every option here is already server-valid, no clamping surprise.
const TIME_OPTIONS = [
  SETTINGS_BOUNDS.secondsPerRound.min,
  SETTINGS_BOUNDS.secondsPerRound.default,
  SETTINGS_BOUNDS.secondsPerRound.max,
];

export function CreateRoomForm({ displayName, avatarId }: CreateRoomFormProps) {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [customWords, setCustomWords] = useState("");
  const [rounds, setRounds] = useState<number>(SETTINGS_BOUNDS.rounds.default);
  const [secondsPerRound, setSecondsPerRound] = useState<number>(
    SETTINGS_BOUNDS.secondsPerRound.default,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Global categories are readable by any authenticated user (RLS: room_id
  // is null), so this is a plain client-side read — no Edge Function needed
  // for a read. Requires a session to already exist, which the CTA click
  // that revealed this panel already guaranteed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureAnonSession();
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
      ...(categories ?? []).map((c) => ({ ...c, emoji: CATEGORY_EMOJI[c.name] ?? "🗂️" })),
    ],
    [categories],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await ensureAnonSession();
      const result = await callFunction<CreateRoomData>("create-room", {
        displayName,
        avatarId,
        roomName,
        password: password || null,
        categoryId,
        customWords: customWords || null,
        settings: { rounds, secondsPerRound },
      });

      if (!result.ok) {
        setError(result.error.message);
        if (result.error.fields) setFieldErrors(result.error.fields);
        return;
      }

      saveIdentity(displayName, avatarId);
      saveRoomCode(result.data.roomCode);
      router.push(`/room/${result.data.roomCode}`);
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
        <Label
          htmlFor="room-name"
          className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase"
        >
          Room name
        </Label>
        <Input
          id="room-name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Friday night trivia"
          maxLength={40}
          required
          className="h-auto rounded-2xl border-[2.5px] border-ink bg-surface px-3.5 py-3 text-lg font-extrabold text-ink shadow-panel focus-visible:ring-2 focus-visible:ring-sky"
        />
        {fieldErrors.roomName && <p className="text-sm text-coral">{fieldErrors.roomName}</p>}
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="room-password"
          className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase"
        >
          Password <span className="normal-case">(optional)</span>
        </Label>
        <div className="flex items-center gap-2 rounded-2xl border-[2.5px] border-ink bg-surface pr-3.5 shadow-panel focus-within:ring-2 focus-within:ring-sky">
          <Input
            id="room-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank for no password"
            autoComplete="new-password"
            className="h-auto flex-1 border-0 bg-transparent px-3.5 py-3 text-lg font-extrabold text-ink shadow-none focus-visible:ring-0"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="shrink-0 text-ink-muted"
          >
            {showPassword ? <EyeOff className="size-4.5" aria-hidden /> : <Eye className="size-4.5" aria-hidden />}
          </button>
        </div>
        {fieldErrors.password && <p className="text-sm text-coral">{fieldErrors.password}</p>}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
          Category
        </Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
          {categoryOptions.map((c) => (
            <Chip
              key={c.id}
              accent="coral"
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

      <div className="flex gap-3.5">
        <div className="flex-1 space-y-2">
          <Label className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
            Rounds
          </Label>
          <Stepper
            value={rounds}
            min={SETTINGS_BOUNDS.rounds.min}
            max={SETTINGS_BOUNDS.rounds.max}
            onChange={setRounds}
            label="rounds"
          />
        </div>
        <div className="flex-[1.3] space-y-2">
          <Label className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
            Time / round
          </Label>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Time per round">
            {TIME_OPTIONS.map((s) => (
              <Chip
                key={s}
                accent="coral"
                selected={secondsPerRound === s}
                onClick={() => setSecondsPerRound(s)}
                role="radio"
                aria-checked={secondsPerRound === s}
                className="flex-1 justify-center"
              >
                {s}s
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="custom-words"
          className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase"
        >
          Custom words <span className="normal-case">(optional)</span>
        </Label>
        <Textarea
          id="custom-words"
          value={customWords}
          onChange={(e) => setCustomWords(e.target.value)}
          placeholder="🦁👑: the lion king, 🍕: pizza"
          rows={3}
          className="rounded-2xl border-[2.5px] border-ink bg-surface px-3.5 py-3 text-sm font-semibold text-ink shadow-panel focus-visible:ring-2 focus-visible:ring-sky"
        />
        <p className="text-sm text-ink-muted">
          {customWordsPreview.pairs.length} pair
          {customWordsPreview.pairs.length === 1 ? "" : "s"}
          {customWordsPreview.errors.length > 0 &&
            ` · ${customWordsPreview.errors.length} problem${
              customWordsPreview.errors.length === 1 ? "" : "s"
            } (fix before submitting)`}
        </p>
        {fieldErrors.customWords && <p className="text-sm text-coral">{fieldErrors.customWords}</p>}
      </div>

      <PopButton
        accent="sun"
        icon={<PartyPopper className="size-5" aria-hidden />}
        title="Make the room"
        subtitle="you become the host"
        type="submit"
        disabled={submitting}
        className="w-full"
      />
    </form>
  );
}
