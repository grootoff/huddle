/** Values shared by the server and the browser. Kept dependency-free. */

/**
 * A room code is both the address and the secret, so it is long enough not to be
 * guessable (33^8 ≈ 1.4e12) while staying readable out loud. I, L and O are left
 * out because they are indistinguishable from 1 and 0 on a phone screen.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ0123456789";
export const ROOM_CODE_LENGTH = 8;
export const ROOM_CODE_PATTERN = /^[A-HJ-KM-NP-Z0-9]{8}$/;

/** Forgiving input cleanup: upper-cases and folds the confusable letters. */
export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .split("")
    .filter((char) => ROOM_CODE_ALPHABET.includes(char))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

/** "8GNY S8UT" — easier to read back to someone across a room. */
export function prettyRoomCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

/**
 * The limit the UI advertises and fails fast against. Inlined at build time, so
 * it is a label, not enforcement — src/lib/limits.ts is the server's authority and
 * is read at runtime. Keep them in step by setting NEXT_PUBLIC_HUDDLE_MAX_FILE_MB
 * before `npm run build`, or by setting both it and HUDDLE_MAX_FILE_MB.
 */
const requestedFileMb = Number(process.env.NEXT_PUBLIC_HUDDLE_MAX_FILE_MB);
export const MAX_FILE_MB =
  Number.isFinite(requestedFileMb) && requestedFileMb > 0 ? Math.min(requestedFileMb, 4096) : 100;
export const MAX_FILE_BYTES = Math.round(MAX_FILE_MB * 1024 * 1024);

/**
 * Total disk one room may hold, as advertised to the UI. The per-file cap alone
 * bounds nothing: fifty 99 MB videos are fifty legal uploads. Enforced by
 * src/lib/limits.ts at runtime; 0 disables the check.
 */
const requestedQuotaMb = Number(process.env.NEXT_PUBLIC_HUDDLE_ROOM_QUOTA_MB);
export const ROOM_QUOTA_MB = Number.isFinite(requestedQuotaMb) && requestedQuotaMb >= 0 ? requestedQuotaMb : 1024;
export const ROOM_QUOTA_BYTES = Math.round(ROOM_QUOTA_MB * 1024 * 1024);
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_NAME_CHARS = 32;
export const MAX_ROOM_NAME_CHARS = 48;
/** How much history a joining client receives. */
export const HISTORY_LIMIT = 500;
/** Typing indicator auto-expiry. */
export const TYPING_TTL_MS = 4000;

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Avatar/name colours, picked deterministically from the member id. */
export const MEMBER_COLORS = [
  "#e11d48",
  "#db2777",
  "#c026d3",
  "#7c3aed",
  "#4f46e5",
  "#2563eb",
  "#0891b2",
  "#0d9488",
  "#059669",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
];
