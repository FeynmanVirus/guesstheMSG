"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { DEFAULT_AVATAR_ID, isValidAvatarId } from "@/lib/avatars";
import { presenceTopic, type RoomPresence } from "@shared/presence";
import { useRoomStore } from "@/lib/room/store";
import type { ChatMessage, RoomPlayer, RoomStatus, RoundInfo } from "@/lib/room/types";

type PlayerRow = {
  id: string;
  display_name: string;
  avatar_id: string;
  is_host: boolean;
  is_spectator: boolean;
  status: "active" | "kicked";
  joined_at: string;
  score: number;
};

type RoundRow = {
  id: string;
  round_number: number;
  emoji_sequence: string;
  started_at: string;
  ends_at: string;
  revealed_at: string | null;
  revealed_answer: string | null;
};

type ChatRow = {
  id: string;
  player_id: string;
  body: string;
  kind: "chat" | "guess" | "system";
  visibility: "all" | "correct";
  round_id: string | null;
  created_at: string;
};

const PLAYER_COLUMNS =
  "id, display_name, avatar_id, is_host, is_spectator, status, joined_at, score";
const ROUND_COLUMNS =
  "id, round_number, emoji_sequence, started_at, ends_at, revealed_at, revealed_answer";
const CHAT_COLUMNS = "id, player_id, body, kind, visibility, round_id, created_at";

function mapPlayer(row: PlayerRow): RoomPlayer {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarId: isValidAvatarId(row.avatar_id) ? row.avatar_id : DEFAULT_AVATAR_ID,
    isHost: row.is_host,
    isSpectator: row.is_spectator,
    status: row.status,
    joinedAt: row.joined_at,
    score: row.score ?? 0,
  };
}

function mapRound(row: RoundRow): RoundInfo {
  return {
    id: row.id,
    roundNumber: row.round_number,
    emojiSequence: row.emoji_sequence,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    revealedAt: row.revealed_at,
    revealedAnswer: row.revealed_answer,
  };
}

function mapMessage(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    playerId: row.player_id,
    body: row.body,
    kind: row.kind,
    visibility: row.visibility,
    roundId: row.round_id,
    createdAt: row.created_at,
  };
}

// Owns the room:<code> Realtime channel — presence (who's connected right
// now) plus Postgres Changes on players/rooms/rounds/chat_messages (durable
// state). One channel per room, created inside this effect (not module
// scope) so React 19 StrictMode's double-mount can't produce two channels
// on one topic.
//
// All four subscriptions filter on a column that never changes for the
// lifetime of the page, so nothing has to re-subscribe when a round rolls
// over. chat_messages carries the winners'-chat rows, and RLS decides
// per-subscriber whether they're delivered at all — there is no client-side
// filtering to bypass.
export function useRoomChannel(code: string, roomId: string | null, myPlayerId: string | null) {
  useEffect(() => {
    if (!roomId || !myPlayerId) return;

    const store = useRoomStore.getState();
    let cancelled = false;

    const channel = supabase.channel(presenceTopic(code), {
      config: { presence: { key: myPlayerId } },
    });

    function applyPresentIds() {
      const state = channel.presenceState<RoomPresence>();
      useRoomStore.getState().setPresence(new Set(Object.keys(state)));
    }

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<RoomPresence>();
        useRoomStore.getState().setPresence(new Set(Object.keys(state)), true);
      })
      .on("presence", { event: "join" }, applyPresentIds)
      .on("presence", { event: "leave" }, applyPresentIds)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string }).id;
            if (oldId) useRoomStore.getState().removePlayer(oldId);
            return;
          }
          useRoomStore.getState().upsertPlayer(mapPlayer(payload.new as PlayerRow));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as {
            id: string;
            status: RoomStatus;
            settings: { rounds?: number } | null;
          };

          // A restart-room (§9) reuses the room, so without this the
          // previous game's final round — recap overlay included — stays
          // on screen until round-tick creates the new game's round 1.
          const prevStatus = useRoomStore.getState().room?.status;
          if (prevStatus === "ended" && row.status === "in_progress") {
            useRoomStore.getState().setRound(null);
          }

          useRoomStore.getState().setRoom({
            id: row.id,
            status: row.status,
            totalRounds: row.settings?.rounds ?? useRoomStore.getState().room?.totalRounds ?? 0,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as RoundRow;
          const next = mapRound(row);

          // Clock-skew correction, sampled only from a round we just saw
          // created. started_at is the server's clock; the gap to ours is
          // the offset, minus one network hop (which biases the countdown
          // very slightly generous — the right direction to be wrong in).
          //
          // Guarded on freshness because the same handler also sees UPDATEs
          // (the reveal), where started_at is legitimately in the past and
          // would produce a garbage offset.
          if (payload.eventType === "INSERT") {
            const drift = new Date(row.started_at).getTime() - Date.now();
            if (Math.abs(drift) > 1000) useRoomStore.getState().setServerOffset(drift);
          }

          // Ignore a stale row arriving after a newer one. Compared on
          // started_at, not round_number: after a restart-room (§9), the
          // new session's round 1 is legitimately "lower numbered" than the
          // round still in the store from the previous game, and a
          // round_number comparison would drop it forever. Equal timestamps
          // (a reveal UPDATE on the round already held) fall through and
          // apply, which is correct.
          const current = useRoomStore.getState().round;
          if (current && new Date(next.startedAt) < new Date(current.startedAt)) return;
          useRoomStore.getState().setRound(next);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          useRoomStore.getState().addMessage(mapMessage(payload.new as ChatRow));
        },
      )
      .subscribe(async (status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          useRoomStore.getState().setConnection("live");
          await channel.track({ playerId: myPlayerId } satisfies RoomPresence);

          // Catch-up read: a refresh or a late join has to land mid-round
          // with the right timer and the messages it's allowed to see.
          const [{ data: playerRows }, { data: roomRow }, { data: roundRows }, { data: chatRows }] =
            await Promise.all([
              supabase.from("players").select(PLAYER_COLUMNS).eq("room_id", roomId),
              supabase.from("rooms").select("id, status, settings").eq("id", roomId).single(),
              supabase
                .from("rounds")
                .select(ROUND_COLUMNS)
                .eq("room_id", roomId)
                .order("started_at", { ascending: false })
                .limit(1),
              supabase
                .from("chat_messages")
                .select(CHAT_COLUMNS)
                .eq("room_id", roomId)
                .order("created_at", { ascending: false })
                .limit(50),
            ]);
          if (cancelled) return;

          if (playerRows) {
            useRoomStore.getState().mergePlayers((playerRows as PlayerRow[]).map(mapPlayer));
          }
          if (roomRow) {
            const settings = roomRow.settings as { rounds?: number } | null;
            useRoomStore.getState().setRoom({
              id: roomRow.id,
              status: roomRow.status as RoomStatus,
              totalRounds: settings?.rounds ?? 0,
            });
          }
          if (roundRows && roundRows.length > 0) {
            useRoomStore.getState().setRound(mapRound(roundRows[0] as RoundRow));
          }
          if (chatRows) {
            useRoomStore.getState().mergeMessages((chatRows as ChatRow[]).map(mapMessage));
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          useRoomStore.getState().setConnection("error");
        }
      });

    return () => {
      cancelled = true;
      channel.untrack();
      supabase.removeChannel(channel);
      store.reset();
    };
  }, [code, roomId, myPlayerId]);
}
