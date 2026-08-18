"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useRoomChannel } from "@/lib/room/use-room-channel";
import { usePresenceGrace } from "@/lib/room/use-presence-grace";
import { useHostHeartbeat } from "@/lib/room/use-host-heartbeat";
import { useHostWatchdog } from "@/lib/room/use-host-watchdog";
import { PlayerList } from "@/components/room/player-list";
import { StartGameButton } from "@/components/room/start-game-button";
import { WaitingForHost } from "@/components/room/waiting-for-host";

interface RoomLobbyProps {
  code: string;
}

type BootstrapPhase = "loading" | "redirecting" | "ready";

// Orchestrator: the bootstrap below is unchanged from the Phase 2 stub
// (session -> room by code -> own players row -> redirect home on any miss,
// RLS doing the membership gate). Everything past that point is new —
// live presence, host heartbeat/migration, and the Start Game flow.
export function RoomLobby({ code }: RoomLobbyProps) {
  const router = useRouter();
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>("loading");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) {
          setBootstrapPhase("redirecting");
          router.replace(`/?code=${code}`);
        }
        return;
      }

      // RLS: rooms_select_member is gated on room membership. No row back
      // means "not a member of this room" — not a special error case, just
      // the membership gate doing its job.
      const { data: room } = await supabase.from("rooms").select("id").eq("code", code).maybeSingle();
      if (!room) {
        if (!cancelled) {
          setBootstrapPhase("redirecting");
          router.replace(`/?code=${code}`);
        }
        return;
      }

      const { data: player } = await supabase
        .from("players")
        .select("id")
        .eq("room_id", room.id)
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (!player) {
        if (!cancelled) {
          setBootstrapPhase("redirecting");
          router.replace(`/?code=${code}`);
        }
        return;
      }

      if (!cancelled) {
        setRoomId(room.id);
        setMyPlayerId(player.id);
        setBootstrapPhase("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, router]);

  const { players, room, presentIds, presenceSynced } = useRoomChannel(code, roomId, myPlayerId);
  const offlineIds = usePresenceGrace(
    players.map((p) => p.id),
    presentIds,
    presenceSynced,
  );

  const me = players.find((p) => p.id === myPlayerId) ?? null;
  const host = players.find((p) => p.isHost) ?? null;
  const isHost = me?.isHost ?? false;

  useHostHeartbeat(myPlayerId, isHost);
  useHostWatchdog({ players, presentIds, presenceSynced, myPlayerId, isHost, roomCode: code });

  if (bootstrapPhase !== "ready" || !room || !me) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-ink-muted">Loading…</p>
      </div>
    );
  }

  // Best-effort before the first presence sync lands — avoids a false "0
  // players present" flash while the socket is still connecting.
  const presentPlayerCount = presenceSynced
    ? players.filter((p) => presentIds.has(p.id)).length
    : players.length;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="doodle-card w-full max-w-md space-y-6 p-6 sm:p-8">
        <div className="text-center">
          <p className="text-sm text-ink-muted">Room code</p>
          <p className="font-heading text-3xl font-semibold tracking-wider text-ink">{code}</p>
        </div>

        {room.status === "in_progress" ? (
          // Seam: the round-loop UI lands here in a future phase.
          <p className="text-center text-ink-muted">Game starting…</p>
        ) : (
          <>
            <PlayerList players={players} myPlayerId={myPlayerId} offlineIds={offlineIds} />

            {me.isSpectator && (
              <p className="text-sm text-ink-muted">
                You&apos;re spectating — you&apos;ll join at the next round.
              </p>
            )}

            {isHost ? (
              <StartGameButton roomCode={code} presentPlayerCount={presentPlayerCount} />
            ) : (
              <WaitingForHost
                hostName={host?.displayName ?? null}
                hostOffline={!!host && offlineIds.has(host.id)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
