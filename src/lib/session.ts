"use client";

/** Per-room credentials + the last name you used, so a refresh is invisible. */

const NAME_KEY = "huddle:name";
const THEME_KEY = "huddle:theme";
const roomKey = (code: string) => `huddle:room:${code}`;

export interface StoredRoom {
  token: string;
  /** Your display name in that room. */
  name: string;
  memberId: string;
  roomName?: string;
  /** Last time you were in the room, for the "recent" list on the home page. */
  at?: number;
}

export interface RecentRoom extends StoredRoom {
  code: string;
}

/** Rooms this browser still holds a token for, most recent first. */
export function listRooms(): RecentRoom[] {
  const out: RecentRoom[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("huddle:room:")) continue;
      const value = read<StoredRoom>(key);
      if (value?.token) out.push({ ...value, code: key.slice("huddle:room:".length) });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadRoom(code: string): StoredRoom | null {
  return read<StoredRoom>(roomKey(code));
}

export function saveRoom(code: string, value: StoredRoom): void {
  try {
    localStorage.setItem(roomKey(code), JSON.stringify({ ...value, at: Date.now() }));
    localStorage.setItem(NAME_KEY, value.name);
  } catch {
    /* private mode / storage full — the app still works for this session */
  }
}

export function clearRoom(code: string): void {
  try {
    localStorage.removeItem(roomKey(code));
  } catch {
    /* ignore */
  }
}

/**
 * The host's own copy of the key they set, so the invite panel can show it
 * later. Never leaves this device — the server only stores a scrypt hash.
 */
export function saveHostKey(code: string, key: string): void {
  try {
    if (key) localStorage.setItem(`huddle:key:${code}`, key);
  } catch {
    /* ignore */
  }
}

export function loadHostKey(code: string): string {
  try {
    return localStorage.getItem(`huddle:key:${code}`) ?? "";
  } catch {
    return "";
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

/* ---------------------------------- theme --------------------------------- */

export type Theme = "light" | "dark";

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}
