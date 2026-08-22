"use client";

import { FunctionRegion } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { ApiErr, ApiOk } from "@shared/errors";

export type { ApiError, ErrorCode } from "@shared/errors";

/** Thin wrapper around supabase.functions.invoke() that unwraps the
 * { ok, data | error } envelope every Edge Function returns (see
 * supabase/functions/_shared/errors.ts). Domain errors come back as normal
 * `ok: false` responses (HTTP 200), not thrown errors — only a genuine
 * network/auth failure throws here.
 *
 * Pinned to ap-northeast-2 (Seoul): the project's database geolocates there
 * (ARCHITECTURE.md §18), and every Edge Function RPC crosses whatever gap
 * exists between where the function executes and where the database lives.
 * Measured, not assumed — 40 real requests per condition: median server
 * processing time dropped from 565ms (auto-routed to ap-south-1, the
 * nearest region to this test's own network but not to the database) to
 * 122ms forced into ap-northeast-2, a 78% reduction, and even the
 * client-observed total (accounting for the extra network distance to
 * Seoul) improved by roughly a third. See §18 for the full numbers and
 * for why 150-200ms end-to-end still isn't reachable from a network that's
 * itself far from Seoul — that's physical distance, not something this
 * pin fixes further. */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<ApiOk<T> | ApiErr> {
  const { data, error } = await supabase.functions.invoke<ApiOk<T> | ApiErr>(name, {
    body,
    region: FunctionRegion.ApNortheast2,
  });

  if (error) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: error.message || "Something went wrong." },
    };
  }
  if (!data) {
    return { ok: false, error: { code: "INTERNAL_ERROR", message: "Empty response." } };
  }
  return data;
}
