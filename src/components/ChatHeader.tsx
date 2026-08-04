"use client";

import type { Member, RoomInfo } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import { LockIcon, LogOutIcon, QrIcon, UsersIcon, WifiOffIcon } from "./icons";
import { IconButton, cx } from "./ui";

export function ChatHeader({
  room,
  members,
  me,
  connected,
  onInvite,
  onMembers,
  onLeave,
}: {
  room: RoomInfo;
  members: Member[];
  me: Member;
  connected: boolean;
  onInvite: () => void;
  onMembers: () => void;
  onLeave: () => void;
}) {
  const online = members.filter((m) => m.online);
  const others = online.filter((m) => m.id !== me.id);
  const subtitle =
    others.length === 0
      ? "Only you so far — invite someone"
      : others.length <= 3
        ? `${others.map((m) => m.name).join(", ")} online`
        : `${online.length} of ${members.length} online`;

  return (
    <header className="z-20 border-b border-zinc-200/80 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-2 py-2 sm:px-4">
        <button
          onClick={onMembers}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition hover:bg-zinc-900/[0.04] dark:hover:bg-white/5"
        >
          <Avatar name={room.name} color="#0d9488" size={38} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold">{room.name}</span>
              {room.locked && <LockIcon width={13} height={13} className="shrink-0 text-amber-500" />}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-mono tracking-wider">{room.code}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{subtitle}</span>
            </span>
          </span>
        </button>

        <div className="flex items-center">
          <IconButton label="Who is here" onClick={onMembers} className="relative">
            <UsersIcon />
            <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-teal-600 px-1 text-[10px] leading-4 font-semibold text-white">
              {members.length}
            </span>
          </IconButton>
          <IconButton label="Invite people" onClick={onInvite}>
            <QrIcon />
          </IconButton>
          <ThemeToggle />
          <IconButton label="Leave huddle" onClick={onLeave} className="hover:text-rose-600">
            <LogOutIcon />
          </IconButton>
        </div>
      </div>

      <div
        className={cx(
          "flex items-center justify-center gap-2 overflow-hidden bg-amber-500/15 text-xs text-amber-700 transition-all dark:text-amber-300",
          connected ? "h-0" : "h-7",
        )}
        aria-live="polite"
      >
        <WifiOffIcon width={14} height={14} />
        Reconnecting…
      </div>
    </header>
  );
}
