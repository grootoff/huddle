/** Values shared by the server and the browser. Kept dependency-free. */

/** Upload ceiling, enforced client-side (fail fast) and server-side (truth). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
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
