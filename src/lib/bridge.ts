/**
 * Next route handlers and the Socket.IO server run in the same process but in
 * separate module graphs (one is bundled by Next, one is loaded by Node), so a
 * plain module-level singleton would be duplicated. `globalThis` is the one
 * thing they share — the server registers the store here at boot and the HTTP
 * routes read it, which keeps a single SQLite connection for the process.
 *
 * Dependency-free on purpose: both graphs import it.
 */

export interface HuddleBridge {
  /** Absolute path of the uploads folder. */
  uploadDir: string;
  /** Returns the member id if the token belongs to a live member of the room. */
  memberIdForToken(roomCode: string, token: string): string | null;
  roomExists(roomCode: string): boolean;
}

const KEY = "__huddleBridge__";

type Holder = { [KEY]?: HuddleBridge };

export function setBridge(bridge: HuddleBridge): void {
  (globalThis as Holder)[KEY] = bridge;
}

export function getBridge(): HuddleBridge | null {
  return (globalThis as Holder)[KEY] ?? null;
}
