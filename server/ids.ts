import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { MEMBER_COLORS } from "../src/lib/constants.ts";

export const newId = (): string => randomUUID();

/** Session credential handed to a client so a refresh keeps its identity. */
export const newToken = (): string => randomBytes(32).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** 6-digit room code, never starting with 0 so it is always 6 characters. */
export const newRoomCode = (): string => String(randomInt(100_000, 1_000_000));

/** Ambiguous characters (0/O, 1/I/l) removed — these get typed by hand. */
const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function suggestPasskey(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return out;
}

export function hashPasskey(passkey: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(passkey.normalize("NFKC"), salt, 32);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPasskey(passkey: string, stored: string): boolean {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = scryptSync(passkey.normalize("NFKC"), Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Stable colour per member so avatars don't shuffle between sessions. */
export function colorFor(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  return MEMBER_COLORS[digest[0] % MEMBER_COLORS.length];
}
