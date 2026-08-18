// Response envelope shared by every Edge Function.
//
// Deliberate convention: HTTP 200 is used for expected *domain* outcomes
// (validation failures, wrong password, room full, kicked, ...) — only auth
// failures (401) and genuine faults (500) get a non-2xx status. Reason:
// `supabase.functions.invoke()` throws on any non-2xx response and buries
// the body behind `err.context.json()`, so coding domain outcomes as
// non-2xx would force every call site into awkward two-branch error
// handling for no benefit. `ok: false` in the body is the actual signal.

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "METHOD_NOT_ALLOWED"
  | "VALIDATION_ERROR"
  | "PROFANITY_BLOCKED"
  | "CATEGORY_NOT_FOUND"
  | "ROOM_NOT_FOUND"
  | "PASSWORD_REQUIRED"
  | "INVALID_PASSWORD"
  | "ROOM_FULL"
  | "KICKED"
  | "CODE_GENERATION_FAILED"
  | "INTERNAL_ERROR"
  // Phase 3 — promote-host / start-game (ARCHITECTURE.md §14)
  | "NOT_A_MEMBER"
  | "NOT_HOST"
  | "NOT_ENOUGH_PLAYERS"
  | "HOST_STILL_ACTIVE"
  | "INVALID_ROOM_STATE";

export interface ApiError {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: ApiError;
}

const STATUS_FOR_CODE: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  METHOD_NOT_ALLOWED: 405,
  CODE_GENERATION_FAILED: 500,
  INTERNAL_ERROR: 500,
};

export function jsonOk<T>(data: T, headers: HeadersInit, status = 200): Response {
  const body: ApiOk<T> = { ok: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function jsonErr(
  code: ErrorCode,
  message: string,
  headers: HeadersInit,
  fields?: Record<string, string>,
): Response {
  const body: ApiErr = { ok: false, error: { code, message, ...(fields ? { fields } : {}) } };
  const status = STATUS_FOR_CODE[code] ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
