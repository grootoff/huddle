import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Storage lives next to the app so a whole Huddle install is one folder you
 * can copy or delete. `node:sqlite` ships with Node 22.6+, so there is no
 * native module to compile.
 */
export const DATA_DIR = process.env.HUDDLE_DATA_DIR ?? path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "huddle.db"));

// WAL keeps readers from blocking the writer; the app is read-heavy.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    code         TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    passkey_hash TEXT,
    host_id      TEXT NOT NULL,
    locked       INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id         TEXT PRIMARY KEY,
    room_code  TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    is_host    INTEGER NOT NULL DEFAULT 0,
    kicked     INTEGER NOT NULL DEFAULT 0,
    joined_at  INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS members_by_room ON members(room_code);

  CREATE TABLE IF NOT EXISTS messages (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT NOT NULL UNIQUE,
    room_code  TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    author_id  TEXT,
    kind       TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    attachment TEXT,
    reply_to   TEXT,
    created_at INTEGER NOT NULL,
    edited_at  INTEGER,
    deleted    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS messages_by_room ON messages(room_code, seq);

  CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL,
    member_id  TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    PRIMARY KEY (message_id, member_id, emoji)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS receipts (
    message_id TEXT NOT NULL,
    member_id  TEXT NOT NULL,
    seen_at    INTEGER NOT NULL,
    PRIMARY KEY (message_id, member_id)
  ) WITHOUT ROWID;
`);
