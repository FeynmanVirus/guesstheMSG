// CORS — supabase.functions.invoke() from the browser to *.supabase.co is
// cross-origin, and a missing/incorrect CORS response is the single most
// common "works in curl, fails in browser" bug for a first Edge Function.
// Wide open (`*`) is fine here: these functions require a valid JWT
// (verify_jwt: true) and do their own authorization from the caller's user
// id, so there's no cookie/credential-based trust being extended by origin.

export const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // Without this, the browser re-runs the OPTIONS preflight before every
  // single invoke — measured at ~157ms p50 in production logs, paid on
  // every guess on top of the POST itself. 86400s (24h) is Chromium's cap;
  // a longer value is silently clamped rather than honored.
  "Access-Control-Max-Age": "86400",
};

/** Returns a preflight Response if this is an OPTIONS request, else null. */
export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}
