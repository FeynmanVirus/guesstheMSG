// Browser Supabase client — a singleton, plain `createClient` (not
// `@supabase/ssr`'s cookie-syncing `createBrowserClient`). ARCHITECTURE.md
// §8 designs sessions around localStorage, not cookies, and this phase has
// no server-side Supabase read that would need a cookie-based session —
// adopting one now would contradict §8 for no benefit.
"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Prefer the modern publishable key; the legacy anon key is kept installed
// as a fallback only (see .env.local) in case a project isn't yet migrated.
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

/** Ensures the browser holds an anonymous Supabase session, creating one
 * lazily on first call rather than on every page load — a crawler hitting
 * `/` shouldn't mint an `auth.users` row. Call this from the Create/Join CTA
 * click handlers, not from a mount effect. */
export async function ensureAnonSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(error?.message ?? "Could not start a session.");
  }
  return data.session;
}
