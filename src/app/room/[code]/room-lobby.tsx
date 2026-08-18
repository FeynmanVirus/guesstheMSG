"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase/client";
import { avatarSrc, DEFAULT_AVATAR_ID, isValidAvatarId, type AvatarId } from "@/lib/avatars";

interface RoomLobbyProps {
  code: string;
}

interface Seat {
  displayName: string;
  avatarId: AvatarId;
  isHost: boolean;
}

// Minimal Phase-2 stub: confirms create/join actually seated the player
// correctly. No Presence, no Start button, no share link/QR — that's a
// later phase (DESIGN.md §2.3 is the full target).
export function RoomLobby({ code }: RoomLobbyProps) {
  const router = useRouter();
  const [seat, setSeat] = useState<Seat | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "redirecting">("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) {
          setStatus("redirecting");
          router.replace(`/?code=${code}`);
        }
        return;
      }

      // RLS: rooms_select_member is gated on room membership. No row back
      // means "not a member of this room" — not a special error case, just
      // the membership gate doing its job — so the visitor goes home to
      // join properly instead of seeing a broken page.
      const { data: room } = await supabase
        .from("rooms")
        .select("id")
        .eq("code", code)
        .maybeSingle();

      if (!room) {
        if (!cancelled) {
          setStatus("redirecting");
          router.replace(`/?code=${code}`);
        }
        return;
      }

      const { data: player } = await supabase
        .from("players")
        .select("display_name, avatar_id, is_host")
        .eq("room_id", room.id)
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!player) {
        if (!cancelled) {
          setStatus("redirecting");
          router.replace(`/?code=${code}`);
        }
        return;
      }

      if (!cancelled) {
        setSeat({
          displayName: player.display_name,
          avatarId: isValidAvatarId(player.avatar_id) ? player.avatar_id : DEFAULT_AVATAR_ID,
          isHost: player.is_host,
        });
        setStatus("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, router]);

  if (status !== "ready" || !seat) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-ink-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="doodle-card w-full max-w-md space-y-6 p-6 text-center sm:p-8">
        <div>
          <p className="text-sm text-ink-muted">Room code</p>
          <p className="font-heading text-4xl font-semibold tracking-wider text-ink">{code}</p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Image
            src={avatarSrc(seat.avatarId)}
            alt=""
            width={72}
            height={72}
            className="size-18 rounded-full border-2 border-ink"
            unoptimized
          />
          <p className="font-medium text-ink">
            {seat.displayName}
            {seat.isHost && <span className="ml-1 text-sun">★ host</span>}
          </p>
        </div>

        <p className="text-ink-muted">Waiting for other players to join…</p>
      </div>
    </div>
  );
}
