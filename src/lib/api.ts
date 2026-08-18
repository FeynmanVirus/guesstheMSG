"use client";

import { supabase } from "@/lib/supabase/client";
import type { ApiErr, ApiOk } from "@shared/errors";

export type { ApiError, ErrorCode } from "@shared/errors";

/** Thin wrapper around supabase.functions.invoke() that unwraps the
 * { ok, data | error } envelope every Edge Function returns (see
 * supabase/functions/_shared/errors.ts). Domain errors come back as normal
 * `ok: false` responses (HTTP 200), not thrown errors — only a genuine
 * network/auth failure throws here. */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<ApiOk<T> | ApiErr> {
  const { data, error } = await supabase.functions.invoke<ApiOk<T> | ApiErr>(name, { body });

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
