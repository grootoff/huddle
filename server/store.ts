import { db } from "./db.ts";
import { colorFor, hashToken, newId, newRoomCode, newToken } from "./ids.ts";
import {
  HISTORY_LIMIT,
  MAX_MESSAGE_CHARS,
  MAX_NAME_CHARS,
  MAX_ROOM_NAME_CHARS,
  normalizeRoomCode,
} from "../src/lib/constants.ts";
import type {
  Attachment,
  Member,
  Message,
  MessageKind,
  ReplyPreview,
  RoomInfo,
  RoomPeek,
} from "../src/lib/types.ts";

/** Error whose message is safe to show the user. */
export class AppError extends Error {}

// Annotated as a variable so TypeScript treats calls to it as unreachable-code
// assertions (control-flow narrowing for `never`-returning function expressions).
const fail: (message: string) => never = (message) => {
  throw new AppError(message);
};

/* ------------------------------ row coercion ------------------------------ */

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : fallback);
const bool = (v: unknown): boolean => num(v) === 1;

const clean = (value: string, max: number): string => value.replace(/\s+/g, " ").trim().slice(0, max);

/* ---------------------------------- rooms --------------------------------- */

function roomRow(code: string): Row | undefined {
  return db.prepare("SELECT * FROM rooms WHERE code = ?").get(code) as Row | undefined;
}

function toRoomInfo(row: Row): RoomInfo {
  return {
    code: str(row.code),
    name: str(row.name),
    hostId: str(row.host_id),
    locked: bool(row.locked),
    createdAt: num(row.created_at),
  };
}

export function getRoom(code: string): RoomInfo | null {
  const row = roomRow(code);
  return row ? toRoomInfo(row) : null;
}

export function peekRoom(code: string): RoomPeek | null {
  const row = roomRow(code);
  if (!row) return null;
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM members WHERE room_code = ? AND kicked = 0")
    .get(code) as Row;
  return {
    code: str(row.code),
    name: str(row.name),
    locked: bool(row.locked),
    memberCount: num(count?.n),
  };
}

export function setLocked(code: string, locked: boolean): void {
  db.prepare("UPDATE rooms SET locked = ? WHERE code = ?").run(locked ? 1 : 0, code);
}

export interface Session {
  room: RoomInfo;
  member: Member;
  token: string;
  /** System message to broadcast, present only for a first-time join. */
  notice: Message | null;
}

export function createRoom(input: { roomName: string; displayName: string }): Session {
  const displayName = clean(input.displayName, MAX_NAME_CHARS) || fail("Please enter your name");
  const roomName = clean(input.roomName, MAX_ROOM_NAME_CHARS) || "Huddle";

  const now = Date.now();
  const hostId = newId();

  // Collisions are vanishingly unlikely, but a code must never be reused.
  let code = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = newRoomCode();
    if (!roomRow(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) fail("Could not allocate a room code — try again");

  db.prepare("INSERT INTO rooms (code, name, host_id, locked, created_at) VALUES (?, ?, ?, 0, ?)").run(
    code,
    roomName,
    hostId,
    now,
  );

  const token = insertMember({ id: hostId, code, name: displayName, isHost: true, now });
  const notice = systemMessage(code, `${displayName} created this huddle`);

  return { room: getRoom(code)!, member: getMember(hostId)!, token, notice };
}

export function joinRoom(input: { code: string; displayName: string; token?: string }): Session {
  const code = normalizeRoomCode(input.code);
  const row = roomRow(code) ?? fail("No huddle with that code");
  const room = toRoomInfo(row);

  // Returning member: the token proves identity even if the room is now locked.
  if (input.token) {
    const existing = db
      .prepare("SELECT * FROM members WHERE room_code = ? AND token_hash = ?")
      .get(code, hashToken(input.token)) as Row | undefined;
    if (existing) {
      if (bool(existing.kicked)) fail("You were removed from this huddle");
      const name = clean(input.displayName, MAX_NAME_CHARS) || str(existing.name);
      db.prepare("UPDATE members SET name = ?, last_seen = ? WHERE id = ?").run(name, Date.now(), str(existing.id));
      return { room, member: getMember(str(existing.id))!, token: input.token, notice: null };
    }
  }

  const displayName = clean(input.displayName, MAX_NAME_CHARS) || fail("Please enter your name");
  if (room.locked) fail("The host has locked this huddle");

  const now = Date.now();
  const id = newId();
  const token = insertMember({ id, code, name: displayName, isHost: false, now });
  const notice = systemMessage(code, `${displayName} joined`);

  return { room, member: getMember(id)!, token, notice };
}

function insertMember(args: { id: string; code: string; name: string; isHost: boolean; now: number }): string {
  const token = newToken();
  db.prepare(
    `INSERT INTO members (id, room_code, name, color, token_hash, is_host, kicked, joined_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    args.id,
    args.code,
    args.name,
    colorFor(args.id),
    hashToken(token),
    args.isHost ? 1 : 0,
    args.now,
    args.now,
  );
  return token;
}

/* --------------------------------- members -------------------------------- */

function toMember(row: Row, onlineIds: ReadonlySet<string>): Member {
  const id = str(row.id);
  return {
    id,
    name: str(row.name),
    color: str(row.color),
    isHost: bool(row.is_host),
    online: onlineIds.has(id),
    joinedAt: num(row.joined_at),
  };
}

const NOBODY: ReadonlySet<string> = new Set();

export function getMember(id: string, onlineIds: ReadonlySet<string> = NOBODY): Member | null {
  const row = db.prepare("SELECT * FROM members WHERE id = ?").get(id) as Row | undefined;
  return row ? toMember(row, onlineIds) : null;
}

export function listMembers(code: string, onlineIds: ReadonlySet<string> = NOBODY): Member[] {
  const rows = db
    .prepare("SELECT * FROM members WHERE room_code = ? AND kicked = 0 ORDER BY joined_at ASC")
    .all(code) as Row[];
  return rows.map((row) => toMember(row, onlineIds));
}

export function memberCount(code: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_code = ? AND kicked = 0").get(code) as Row;
  return num(row?.n);
}

export function touchMember(id: string): void {
  db.prepare("UPDATE members SET last_seen = ? WHERE id = ?").run(Date.now(), id);
}

export function kickMember(code: string, actorId: string, targetId: string): { member: Member; notice: Message } {
  const room = getRoom(code) ?? fail("Huddle is gone");
  if (room.hostId !== actorId) fail("Only the host can remove people");
  if (targetId === actorId) fail("You cannot remove yourself");
  const target = getMember(targetId) ?? fail("That person is not here");
  db.prepare("UPDATE members SET kicked = 1 WHERE id = ? AND room_code = ?").run(targetId, code);
  return { member: target, notice: systemMessage(code, `${target.name} was removed by the host`) };
}

/** Used by the upload route to authenticate a raw-body PUT. */
export function memberIdForToken(code: string, token: string): string | null {
  const row = db
    .prepare("SELECT id FROM members WHERE room_code = ? AND token_hash = ? AND kicked = 0")
    .get(code, hashToken(token)) as Row | undefined;
  return row ? str(row.id) : null;
}

/* -------------------------------- messages -------------------------------- */

function previewOf(kind: MessageKind, body: string, attachment: Attachment | null): string {
  if (attachment) {
    const icon = { image: "📷", video: "🎬", audio: "🎤", file: "📎" }[attachment.kind];
    return `${icon} ${attachment.kind === "audio" ? "Voice message" : attachment.name}`;
  }
  return body.slice(0, 140);
}

function toMessage(row: Row, reactions: Record<string, string[]>, seenBy: string[], reply: ReplyPreview | null): Message {
  const rawAttachment = str(row.attachment, "");
  const kind = str(row.kind, "text") as MessageKind;
  const deleted = bool(row.deleted);
  return {
    id: str(row.id),
    seq: num(row.seq),
    kind,
    authorId: typeof row.author_id === "string" ? row.author_id : null,
    authorName: str(row.author_name, "Someone"),
    authorColor: str(row.author_color, "#64748b"),
    body: deleted ? "" : str(row.body),
    attachment: deleted || !rawAttachment ? null : (JSON.parse(rawAttachment) as Attachment),
    replyTo: reply,
    createdAt: num(row.created_at),
    editedAt: typeof row.edited_at === "number" ? row.edited_at : null,
    deleted,
    reactions,
    seenBy,
  };
}

const MESSAGE_SELECT = `
  SELECT m.*, mem.name AS author_name, mem.color AS author_color
  FROM messages m LEFT JOIN members mem ON mem.id = m.author_id
`;

function replyPreviewFor(id: string | null): ReplyPreview | null {
  if (!id) return null;
  const row = db
    .prepare(`${MESSAGE_SELECT} WHERE m.id = ?`)
    .get(id) as Row | undefined;
  if (!row) return null;
  const attachment = str(row.attachment, "");
  return {
    id: str(row.id),
    authorName: str(row.author_name, "Someone"),
    preview: bool(row.deleted)
      ? "Message deleted"
      : previewOf(str(row.kind, "text") as MessageKind, str(row.body), attachment ? (JSON.parse(attachment) as Attachment) : null),
  };
}

export function getMessage(id: string): Message | null {
  const row = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id) as Row | undefined;
  if (!row) return null;
  return toMessage(row, reactionsFor(id), receiptsFor(id), replyPreviewFor(typeof row.reply_to === "string" ? row.reply_to : null));
}

export function history(code: string): Message[] {
  const rows = (
    db.prepare(`${MESSAGE_SELECT} WHERE m.room_code = ? ORDER BY m.seq DESC LIMIT ?`).all(code, HISTORY_LIMIT) as Row[]
  ).reverse();
  if (rows.length === 0) return [];

  const minSeq = num(rows[0].seq);
  const reactions = new Map<string, Record<string, string[]>>();
  for (const r of db
    .prepare(
      `SELECT r.message_id, r.member_id, r.emoji FROM reactions r
       JOIN messages m ON m.id = r.message_id WHERE m.room_code = ? AND m.seq >= ?`,
    )
    .all(code, minSeq) as Row[]) {
    const forMessage = reactions.get(str(r.message_id)) ?? {};
    (forMessage[str(r.emoji)] ??= []).push(str(r.member_id));
    reactions.set(str(r.message_id), forMessage);
  }

  const receipts = new Map<string, string[]>();
  for (const r of db
    .prepare(
      `SELECT c.message_id, c.member_id FROM receipts c
       JOIN messages m ON m.id = c.message_id WHERE m.room_code = ? AND m.seq >= ?`,
    )
    .all(code, minSeq) as Row[]) {
    const list = receipts.get(str(r.message_id)) ?? [];
    list.push(str(r.member_id));
    receipts.set(str(r.message_id), list);
  }

  const replies = new Map<string, ReplyPreview | null>();
  const replyFor = (id: string | null): ReplyPreview | null => {
    if (!id) return null;
    if (!replies.has(id)) replies.set(id, replyPreviewFor(id));
    return replies.get(id) ?? null;
  };

  return rows.map((row) =>
    toMessage(
      row,
      reactions.get(str(row.id)) ?? {},
      receipts.get(str(row.id)) ?? [],
      replyFor(typeof row.reply_to === "string" ? row.reply_to : null),
    ),
  );
}

export function addMessage(args: {
  id?: string;
  code: string;
  authorId: string;
  body: string;
  attachment?: Attachment | null;
  replyToId?: string | null;
}): Message {
  const body = args.body.slice(0, MAX_MESSAGE_CHARS).trimEnd();
  const attachment = args.attachment ?? null;
  if (!body && !attachment) fail("Nothing to send");

  const id = args.id && /^[\w-]{8,64}$/.test(args.id) ? args.id : newId();
  if (db.prepare("SELECT 1 FROM messages WHERE id = ?").get(id)) {
    // Duplicate ack/retry — return what we already stored.
    return getMessage(id)!;
  }

  // Only allow replies to messages in the same room.
  let replyTo: string | null = null;
  if (args.replyToId) {
    const target = db
      .prepare("SELECT id FROM messages WHERE id = ? AND room_code = ?")
      .get(args.replyToId, args.code) as Row | undefined;
    replyTo = target ? str(target.id) : null;
  }

  db.prepare(
    `INSERT INTO messages (id, room_code, author_id, kind, body, attachment, reply_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    args.code,
    args.authorId,
    attachment ? "file" : "text",
    body,
    attachment ? JSON.stringify(attachment) : null,
    replyTo,
    Date.now(),
  );

  return getMessage(id)!;
}

export function systemMessage(code: string, body: string): Message {
  const id = newId();
  db.prepare(
    "INSERT INTO messages (id, room_code, author_id, kind, body, created_at) VALUES (?, ?, NULL, 'system', ?, ?)",
  ).run(id, code, body, Date.now());
  return getMessage(id)!;
}

/**
 * Marks a message deleted and reports the attachment that went with it, so the
 * caller can remove the bytes: "delete for everyone" that leaves the file sitting
 * at its URL has not deleted anything.
 */
export function deleteMessage(
  code: string,
  actorId: string,
  messageId: string,
): { message: Message; attachmentId: string | null } {
  const row =
    (db.prepare("SELECT * FROM messages WHERE id = ? AND room_code = ?").get(messageId, code) as Row | undefined) ??
    fail("Message not found");
  const room = getRoom(code) ?? fail("Huddle is gone");
  const isAuthor = str(row.author_id) === actorId;
  if (!isAuthor && room.hostId !== actorId) fail("You can only delete your own messages");

  const raw = str(row.attachment, "");
  const attachmentId = raw ? ((JSON.parse(raw) as Attachment).id ?? null) : null;

  db.prepare("UPDATE messages SET deleted = 1, body = '', attachment = NULL WHERE id = ?").run(messageId);
  return { message: getMessage(messageId)!, attachmentId };
}

/* -------------------------- reactions and receipts ------------------------ */

export function reactionsFor(messageId: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of db
    .prepare("SELECT member_id, emoji FROM reactions WHERE message_id = ?")
    .all(messageId) as Row[]) {
    (out[str(row.emoji)] ??= []).push(str(row.member_id));
  }
  return out;
}

export function receiptsFor(messageId: string): string[] {
  return (db.prepare("SELECT member_id FROM receipts WHERE message_id = ?").all(messageId) as Row[]).map((r) =>
    str(r.member_id),
  );
}

export function toggleReaction(code: string, memberId: string, messageId: string, emoji: string): Record<string, string[]> {
  const exists = db.prepare("SELECT 1 FROM messages WHERE id = ? AND room_code = ?").get(messageId, code);
  if (!exists) fail("Message not found");
  const mine = db
    .prepare("SELECT 1 FROM reactions WHERE message_id = ? AND member_id = ? AND emoji = ?")
    .get(messageId, memberId, emoji);
  if (mine) {
    db.prepare("DELETE FROM reactions WHERE message_id = ? AND member_id = ? AND emoji = ?").run(
      messageId,
      memberId,
      emoji,
    );
  } else {
    db.prepare("INSERT INTO reactions (message_id, member_id, emoji) VALUES (?, ?, ?)").run(
      messageId,
      memberId,
      emoji,
    );
  }
  return reactionsFor(messageId);
}

/* -------------------------------- janitorial ------------------------------ */

/**
 * Drops rooms nobody has touched in a while, so a long-running server does not
 * accumulate other people's chat history forever. Returns the codes removed so
 * the caller can delete their uploaded files.
 */
export function purgeStaleRooms(maxIdleMs: number): string[] {
  const cutoff = Date.now() - maxIdleMs;
  const rows = db
    .prepare(
      `SELECT r.code AS code FROM rooms r
       LEFT JOIN members m ON m.room_code = r.code
       GROUP BY r.code
       HAVING IFNULL(MAX(m.last_seen), r.created_at) < ?`,
    )
    .all(cutoff) as Row[];

  const codes = rows.map((row) => str(row.code));
  const drop = db.prepare("DELETE FROM rooms WHERE code = ?");
  for (const code of codes) drop.run(code);

  // reactions/receipts intentionally have no FK (hot write path), so sweep them.
  db.exec("DELETE FROM reactions WHERE message_id NOT IN (SELECT id FROM messages)");
  db.exec("DELETE FROM receipts WHERE message_id NOT IN (SELECT id FROM messages)");
  return codes;
}

/** Records read receipts; returns the ids that were newly marked. */
export function markSeen(code: string, memberId: string, ids: string[]): string[] {
  const now = Date.now();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO receipts (message_id, member_id, seen_at)
     SELECT id, ?, ? FROM messages WHERE id = ? AND room_code = ? AND author_id IS NOT ?`,
  );
  const applied: string[] = [];
  for (const id of ids.slice(0, 500)) {
    const result = insert.run(memberId, now, id, code, memberId);
    if (num(result.changes) > 0) applied.push(id);
  }
  return applied;
}
