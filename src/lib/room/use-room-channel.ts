"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { DEFAULT_AVATAR_ID, isValidAvatarId } from "@/lib/avatars";
import { presenceTopic, type RoomPresence } from "@shared/presence";
import type { RoomInfo, RoomPlayer, RoomStatus } from "@/lib/room/types";

type PlayerRow = {
  id: string;
  display_name: string;
  avatar_id: string;
  is_host: boolean;
  is_spectator: boolean;
  status: "active" | "kicked";
  joined_at: string;
};

function mapPlayer(row: PlayerRow): RoomPlayer {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarId: isValidAvatarId(row.avatar_id) ? row.avatar_id : DEFAULT_AVATAR_ID,
    isHost: row.is_host,
    isSpectator: row.is_spectator,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

function playersEqual(a: RoomPlayer, b: RoomPlayer): boolean {
  return (
    a.displayName === b.displayName &&
    a.avatarId === b.avatarId &&
    a.isHost === b.isHost &&
    a.isSpectator === b.isSpectator &&
    a.status === b.status &&
    a.joinedAt === b.joinedAt
  );
}

function sortPlayers(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
}

interface UseRoomChannelResult {
  players: RoomPlayer[];
  room: RoomInfo | null;
  presentIds: Set<string>;
  presenceSynced: boolean;
  connection: "connecting" | "live" | "error";
}

// Owns the room:<code> Realtime channel — presence (who's connected right
// now) plus Postgres Changes on `players`/`rooms` (durable state). One
// channel per room, created inside this effect (not module scope) so React
// 19 StrictMode's double-mount can't produce two channels on one topic.
export function useRoomChannel(
  code: string,
  roomId: string | null,
  myPlayerId: string | null,
): UseRoomChannelResult {
  const [playersMap, setPlayersMap] = useState<Map<string, RoomPlayer>>(new Map());
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [presenceSynced, setPresenceSynced] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "live" | "error">("connecting");

  useEffect(() => {
    if (!roomId || !myPlayerId) return;

    // No reset of presenceSynced/connection here: roomId/myPlayerId are set
    // once by the bootstrap and never change for the lifetime of this
    // component, so this effect only ever runs once (plus unmount cleanup)
    // — their useState initial values already cover the "connecting" state.

    let cancelled = false;

    const channel = supabase.channel(presenceTopic(code), {
      config: { presence: { key: myPlayerId } },
    });

    function applyPresentIds() {
      const state = channel.presenceState<RoomPresence>();
      setPresentIds(new Set(Object.keys(state)));
    }

    channel
      .on("presence", { event: "sync" }, () => {
        applyPresentIds();
        setPresenceSynced(true);
      })
      .on("presence", { event: "join" }, applyPresentIds)
      .on("presence", { event: "leave" }, applyPresentIds)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string }).id;
            if (!oldId) return;
            setPlayersMap((prev) => {
              if (!prev.has(oldId)) return prev;
              const next = new Map(prev);
              next.delete(oldId);
              return next;
            });
            return;
          }
          const next = mapPlayer(payload.new as PlayerRow);
          setPlayersMap((prev) => {
            const existing = prev.get(next.id);
            if (existing && playersEqual(existing, next)) return prev; // last_seen_at-only heartbeat delta — skip
            const updated = new Map(prev);
            updated.set(next.id, next);
            return updated;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as { id: string; status: RoomStatus };
          setRoom({ id: row.id, status: row.status });
        },
      )
      .subscribe(async (status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          await channel.track({ playerId: myPlayerId } satisfies RoomPresence);

          const [{ data: playerRows }, { data: roomRow }] = await Promise.all([
            supabase
              .from("players")
              .select("id, display_name, avatar_id, is_host, is_spectator, status, joined_at")
              .eq("room_id", roomId),
            supabase.from("rooms").select("id, status").eq("id", roomId).single(),
          ]);
          if (cancelled) return;
          if (playerRows) {
            setPlayersMap((prev) => {
              const next = new Map(prev);
              for (const row of playerRows as PlayerRow[]) next.set(row.id, mapPlayer(row));
              return next;
            });
          }
          if (roomRow) setRoom({ id: roomRow.id, status: roomRow.status as RoomStatus });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("error");
        }
      });

    return () => {
      cancelled = true;
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [code, roomId, myPlayerId]);

  return {
    players: sortPlayers(Array.from(playersMap.values())),
    room,
    presentIds,
    presenceSynced,
    connection,
  };
}
