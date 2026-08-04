"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MAX_NAME_CHARS, prettyRoomCode } from "@/lib/constants";
import { loadName } from "@/lib/session";
import type { RoomPeek } from "@/lib/types";
import { UsersIcon } from "./icons";
import { Button, Field, Spinner } from "./ui";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Nobody enters a room anonymously — this is the "who are you?" step, plus the
 * key prompt when the host set one.
 */
export function JoinGate({
  code,
  peek,
  error,
  busy,
  onJoin,
}: {
  code: string;
  peek: RoomPeek | null;
  error: string | null;
  busy: boolean;
  onJoin: (input: { displayName: string }) => void;
}) {
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = loadName();
    setName(saved);
    if (saved) return;
    nameRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center px-5 py-10 sm:justify-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onJoin({ displayName: name.trim() });
        }}
        className="w-full max-w-sm rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="mb-5 text-center">
          <div className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-teal-600/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300">
            <UsersIcon width={24} height={24} />
          </div>
          <h1 className="text-xl font-semibold">{peek?.name ?? "Join this huddle"}</h1>
          <p className="mt-1 font-mono text-sm tracking-[0.2em] text-zinc-400">{prettyRoomCode(code)}</p>
          {peek && (
            <p className="mt-2 text-xs text-zinc-500">
              {peek.memberCount} {peek.memberCount === 1 ? "person" : "people"} inside
            </p>
          )}
        </div>

        <div className="space-y-4">
          <Field
            label="Your name"
            ref={nameRef}
            value={name}
            maxLength={MAX_NAME_CHARS}
            autoComplete="nickname"
            placeholder="How should people see you?"
            onChange={(event) => setName(event.target.value)}
          />

          {error && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" block disabled={busy || !name.trim()}>
            {busy && <Spinner />}
            Join
          </Button>

          <p className="text-center text-xs text-zinc-400">
            <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-zinc-600">
              Use a different code
            </Link>
          </p>
        </div>
      </form>
    </main>
  );
}
