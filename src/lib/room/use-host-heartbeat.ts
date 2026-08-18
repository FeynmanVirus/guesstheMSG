"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { PRESENCE_TIMING } from "@shared/presence";

/** No-ops unless I'm the host. Writes players.last_seen_at every
 * HEARTBEAT_INTERVAL_MS — the value is server-stamped by the migration's
 * trigger regardless of what's sent, so this is best-effort/fire-and-forget:
 * a missed beat just gets caught by the next interval tick. */
export function useHostHeartbeat(myPlayerId: string | null, isHost: boolean) {
  useEffect(() => {
    if (!myPlayerId || !isHost) return;

    const beat = () => {
      void supabase.from("players").update({ last_seen_at: new Date().toISOString() }).eq("id", myPlayerId);
    };

    beat();
    const interval = setInterval(beat, PRESENCE_TIMING.HEARTBEAT_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") beat();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [myPlayerId, isHost]);
}
