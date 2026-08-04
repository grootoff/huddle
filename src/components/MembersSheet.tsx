"use client";

import type { Member } from "@/lib/types";
import { Avatar } from "./Avatar";
import { LockIcon, LogOutIcon, UnlockIcon } from "./icons";
import { Button, Modal, cx } from "./ui";

export function MembersSheet({
  open,
  onClose,
  members,
  me,
  hostId,
  locked,
  onKick,
  onToggleLock,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  me: Member;
  hostId: string;
  locked: boolean;
  onKick: (memberId: string) => void;
  onToggleLock: (locked: boolean) => void;
}) {
  const iAmHost = me.id === hostId;
  const online = members.filter((m) => m.online).length;

  return (
    <Modal open={open} onClose={onClose} title={`In this huddle · ${online}/${members.length} online`}>
      <ul className="scroll-slim -mx-1 max-h-80 space-y-0.5 overflow-y-auto px-1">
        {[...members]
          .sort((a, b) => Number(b.online) - Number(a.online) || a.joinedAt - b.joinedAt)
          .map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Avatar name={member.name} color={member.color} size={38} online={member.online} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.id === me.id && <span className="ml-1.5 text-xs text-zinc-400">you</span>}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                  {member.id === hostId && (
                    <span className="rounded bg-teal-600/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-teal-700 uppercase dark:bg-teal-400/15 dark:text-teal-300">
                      Host
                    </span>
                  )}
                  {member.online ? "Online" : "Offline"}
                </p>
              </div>
              {iAmHost && member.id !== me.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onKick(member.id)}
                  className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                >
                  <LogOutIcon width={15} height={15} />
                  Remove
                </Button>
              )}
            </li>
          ))}
      </ul>

      {iAmHost && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
          <span className={cx("mt-0.5", locked ? "text-amber-600" : "text-zinc-400")}>
            {locked ? <LockIcon /> : <UnlockIcon />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{locked ? "Huddle is locked" : "Anyone with the code can join"}</p>
            <p className="text-xs text-zinc-500">
              {locked
                ? "New people are turned away. People already here stay."
                : "Lock it once everyone has arrived."}
            </p>
          </div>
          <Button variant={locked ? "primary" : "subtle"} size="sm" onClick={() => onToggleLock(!locked)}>
            {locked ? "Unlock" : "Lock"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
