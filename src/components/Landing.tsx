"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { copyText } from "@/lib/clipboard";
import { IS_SPLIT_DEPLOY, apiUrl } from "@/lib/config";
import { ask, getSocket } from "@/lib/socket";
import { listRooms, loadName, saveName, saveRoom, type RecentRoom } from "@/lib/session";
import {
  MAX_NAME_CHARS,
  MAX_ROOM_NAME_CHARS,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  normalizeRoomCode,
  prettyRoomCode,
} from "@/lib/constants";
import type { RoomState } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import { Button, Field, Spinner, Toast, cx } from "./ui";
import { UsersIcon } from "./icons";

type Mode = "join" | "create";

export function Landing() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRoom[]>([]);
  const [lanUrl, setLanUrl] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(loadName());
    // Skip anything stored under an older code format — those rooms are gone.
    setRecent(listRooms().filter((room) => ROOM_CODE_PATTERN.test(room.code)).slice(0, 4));
    getSocket(); // warm the connection while the user types
    // The "others can reach this at…" hint is a LAN thing; when the UI is hosted
    // publicly the address is simply this page's own URL, so there is nothing to say.
    if (IS_SPLIT_DEPLOY) return;
    fetch(apiUrl("/api/net"))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { origin?: string; servedOverLan?: boolean } | null) => {
        if (data?.origin) setLanUrl(data.origin);
      })
      .catch(() => setLanUrl(null));
  }, []);

  const trimmedName = name.trim();

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    const wanted = normalizeRoomCode(code);
    if (wanted.length !== ROOM_CODE_LENGTH) {
      setError(`Room codes are ${ROOM_CODE_LENGTH} characters`);
      return;
    }
    if (!trimmedName) {
      setError("Enter your name so people know who you are");
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Check the code exists before navigating, so a typo is caught right here
      // instead of on a blank room screen.
      const peek = await ask<{ locked: boolean }>(getSocket(), "room:peek", wanted);
      saveName(trimmedName);
      if (peek.locked) {
        setError("That huddle is locked by its host");
        setBusy(false);
        return;
      }
      router.push(`/r/${wanted}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not find that huddle");
      setBusy(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmedName) {
      setError("Enter your name first");
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const state = await ask<RoomState>(getSocket(), "room:create", {
        displayName: trimmedName,
        roomName: roomName.trim(),
      });
      saveName(trimmedName);
      saveRoom(state.room.code, {
        token: state.token,
        name: state.me.name,
        memberId: state.me.id,
        roomName: state.room.name,
      });
      router.push(`/r/${state.room.code}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the huddle");
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center px-5 py-8 sm:justify-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <div className="mb-3 inline-flex size-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/25">
            <UsersIcon width={28} height={28} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Huddle</h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] text-zinc-500 dark:text-zinc-400">
            A private chat room for everyone on this Wi-Fi. No accounts, nothing leaves the network.
          </p>
        </header>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-xl shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950/60">
            {(["join", "create"] as Mode[]).map((value) => (
              <button
                key={value}
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
                className={cx(
                  "h-9 flex-1 rounded-lg text-sm font-medium transition-colors",
                  mode === value
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                {value === "join" ? "Join a huddle" : "Start one"}
              </button>
            ))}
          </div>

          <form onSubmit={mode === "join" ? handleJoin : handleCreate} className="space-y-4 p-4 pt-5">
            <Field
              label="Your name"
              ref={nameRef}
              value={name}
              maxLength={MAX_NAME_CHARS}
              autoComplete="nickname"
              placeholder="e.g. Manish"
              onChange={(event) => setName(event.target.value)}
            />

            {mode === "join" ? (
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-zinc-600 dark:text-zinc-400">
                  Room code
                </span>
                <input
                  value={prettyRoomCode(code)}
                  onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="ABCD 1234"
                  aria-label={`${ROOM_CODE_LENGTH}-character room code`}
                  className="h-14 w-full rounded-xl border border-zinc-200 bg-white text-center font-mono text-2xl tracking-[0.25em] text-zinc-900 uppercase caret-teal-600 outline-none transition placeholder:text-zinc-300 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-700"
                />
                <span className="mt-1.5 block text-xs text-zinc-500">
                  {code.length}/{ROOM_CODE_LENGTH} — letters and numbers, case does not matter
                </span>
              </div>
            ) : (
              <Field
                label="Huddle name"
                value={roomName}
                maxLength={MAX_ROOM_NAME_CHARS}
                placeholder="Design standup"
                onChange={(event) => setRoomName(event.target.value)}
                hint="Optional — shown at the top of the chat"
              />
            )}

            {error && (
              <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" block disabled={busy}>
              {busy && <Spinner />}
              {mode === "join" ? "Join huddle" : "Create huddle"}
            </Button>

            {mode === "create" && (
              <p className="text-center text-xs text-zinc-400">
                You&apos;ll get a code like <span className="font-mono">8GNY S8UT</span>. It is the room&apos;s only
                secret, so share it the way you would a password.
              </p>
            )}
          </form>
        </div>

        {recent.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Jump back in</h2>
            <ul className="space-y-1.5">
              {recent.map((room) => (
                <li key={room.code}>
                  <button
                    onClick={() => router.push(`/r/${room.code}`)}
                    className="flex w-full items-center gap-3 rounded-xl border border-zinc-200/70 bg-white/70 p-2.5 text-left transition hover:border-teal-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-teal-700 dark:hover:bg-zinc-900"
                  >
                    <Avatar name={room.roomName || room.code} color="#0d9488" size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{room.roomName || "Huddle"}</span>
                      <span className="block font-mono text-xs text-zinc-500">{prettyRoomCode(room.code)}</span>
                    </span>
                    <span className="text-xs text-zinc-400">as {room.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lanUrl && (
          <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
            Others can reach this app at{" "}
            <button
              onClick={() => {
                void copyText(lanUrl).then((ok) => setToast(ok ? "Address copied" : "Copy failed — select it by hand"));
              }}
              className="font-mono text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-teal-600 dark:text-zinc-400"
            >
              {lanUrl}
            </button>
          </p>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}
