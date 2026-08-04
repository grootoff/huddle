import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { MEMBER_COLORS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../src/lib/constants.ts";

export const newId = (): string => randomUUID();

/** Session credential handed to a client so a refresh keeps its identity. */
export const newToken = (): string => randomBytes(32).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/**
 * The room code doubles as the room's secret, so it comes from a CSPRNG over an
 * unambiguous alphabet rather than being a short number anyone could enumerate.
 */
export function newRoomCode(): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) out += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return out;
}

/** Stable colour per member so avatars don't shuffle between sessions. */
export function colorFor(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  return MEMBER_COLORS[digest[0] % MEMBER_COLORS.length];
}
