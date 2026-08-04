/**
 * Server-side truth for upload limits.
 *
 * Kept apart from constants.ts because of how Next handles env vars: anything
 * prefixed NEXT_PUBLIC_ is *inlined at build time*, in server bundles too, so a
 * route handler reading one gets whatever was set during `next build` — not what
 * is set when the server runs. Plain env vars are read at runtime, so HUDDLE_*
 * below can be changed with a restart and no rebuild.
 *
 * These are functions, not constants, so a value is never captured at import.
 */

const DEFAULT_MAX_FILE_MB = 100;
const DEFAULT_ROOM_QUOTA_MB = 1024;

/** Beyond this, browsers and proxies are the bottleneck, not us. */
const HARD_MAX_FILE_MB = 4096;

function readMb(runtimeKey: string, buildKey: string, fallback: number, hardMax: number): number {
  // Runtime value wins; the NEXT_PUBLIC one is a convenience so that setting a
  // single variable before build+start keeps the UI copy and the server in step.
  const raw = process.env[runtimeKey] ?? process.env[buildKey];
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.min(value, hardMax);
}

export function maxFileMb(): number {
  const value = readMb("HUDDLE_MAX_FILE_MB", "NEXT_PUBLIC_HUDDLE_MAX_FILE_MB", DEFAULT_MAX_FILE_MB, HARD_MAX_FILE_MB);
  return value > 0 ? value : DEFAULT_MAX_FILE_MB;
}

export function maxFileBytes(): number {
  return Math.round(maxFileMb() * 1024 * 1024);
}

/** 0 disables the per-room quota. */
export function roomQuotaMb(): number {
  return readMb(
    "HUDDLE_ROOM_QUOTA_MB",
    "NEXT_PUBLIC_HUDDLE_ROOM_QUOTA_MB",
    DEFAULT_ROOM_QUOTA_MB,
    Number.MAX_SAFE_INTEGER,
  );
}

export function roomQuotaBytes(): number {
  return Math.round(roomQuotaMb() * 1024 * 1024);
}
