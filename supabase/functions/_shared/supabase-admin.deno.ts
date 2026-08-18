// Deno-only Supabase client factories. The `.deno.ts` suffix excludes this
// file from Next's `tsc` (see tsconfig.json's `exclude`) since it uses
// `Deno.env`, which isn't declared outside the Deno runtime.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// auto-injected into every Edge Function by the Supabase runtime — never
// read from a repo .env file here.

import { createClient } from "@supabase/supabase-js";

/** Full-privilege client for trusted writes. Bypasses RLS entirely — every
 * write this performs must already have been validated in application code.
 * Never let this client's key or a wrapper around it reach a response body. */
export function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Client scoped to the calling user's own JWT (forwarded from the incoming
 * request's Authorization header) — used only to resolve `auth.getUser()`,
 * never for writes. Reads run under RLS as `authenticated`, matching
 * exactly what the real player could see. */
export function createCallerClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    },
  );
}
