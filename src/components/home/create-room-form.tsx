"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { supabase, ensureAnonSession } from "@/lib/supabase/client";
import { callFunction } from "@/lib/api";
import { saveIdentity, saveRoomCode } from "@/lib/identity";
import type { AvatarId } from "@/lib/avatars";
import { parseCustomWords } from "@shared/custom-words";
import { SETTINGS_BOUNDS } from "@shared/settings";

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

export function CreateRoomForm({ displayName, avatarId }: CreateRoomFormProps) {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
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
        <Label htmlFor="room-name">Room name</Label>
        <Input
          id="room-name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Friday night trivia"
          maxLength={40}
          required
        />
        {fieldErrors.roomName && (
          <p className="text-sm text-coral">{fieldErrors.roomName}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="room-password">Password (optional)</Label>
        <Input
          id="room-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave blank for no password"
          autoComplete="new-password"
        />
        {fieldErrors.password && <p className="text-sm text-coral">{fieldErrors.password}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="room-category">Category</Label>
        <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
          <SelectTrigger id="room-category" className="w-full">
            <SelectValue placeholder={categories === null ? "Loading…" : "Choose a category"} />
          </SelectTrigger>
          <SelectContent>
            {(categories ?? []).map((c) => (
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
        <Label htmlFor="custom-words">Custom words (optional)</Label>
        <Textarea
          id="custom-words"
          value={customWords}
          onChange={(e) => setCustomWords(e.target.value)}
          placeholder="🦁👑: the lion king, 🍕: pizza"
          rows={3}
        />
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="rounds">Rounds</Label>
          <Input
            id="rounds"
            type="number"
            min={SETTINGS_BOUNDS.rounds.min}
            max={SETTINGS_BOUNDS.rounds.max}
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seconds-per-round">Seconds/round</Label>
          <Input
            id="seconds-per-round"
            type="number"
            min={SETTINGS_BOUNDS.secondsPerRound.min}
            max={SETTINGS_BOUNDS.secondsPerRound.max}
            value={secondsPerRound}
            onChange={(e) => setSecondsPerRound(Number(e.target.value))}
          />
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="doodle-btn w-full">
        {submitting ? "Creating room…" : "Create room"}
      </Button>
    </form>
  );
}
