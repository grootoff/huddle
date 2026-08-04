"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/hooks/useRoom";
import { formatDayLabel, sameDay } from "@/lib/format";
import type { Member } from "@/lib/types";
import { MessageRow } from "./MessageRow";
import { ArrowDownIcon } from "./icons";
import { cx } from "./ui";

interface Props {
  messages: ChatMessage[];
  me: Member;
  /** Everyone in the room, for read-receipt maths. */
  members: Member[];
  hostId: string;
  roomCode: string;
  typers: Array<{ id: string; name: string }>;
  onReply: (message: ChatMessage) => void;
  onReact: (id: string, emoji: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onOpenImage: (src: string, name: string, downloadUrl?: string) => void;
  onMarkSeen: () => void;
}

/** Messages from the same person within this window share one avatar. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const BOTTOM_SLACK_PX = 96;

export function MessageList({
  messages,
  me,
  members,
  hostId,
  roomCode,
  typers,
  onReply,
  onReact,
  onDelete,
  onRetry,
  onOpenImage,
  onMarkSeen,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const atBottomRef = useRef(true);
  const seenCountRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setUnread(0);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = distance < BOTTOM_SLACK_PX;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (bottom) {
      setUnread(0);
      if (document.visibilityState === "visible") onMarkSeen();
    }
  }, [onMarkSeen]);

  // Keep the view pinned when new messages land, unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const previous = seenCountRef.current;
    seenCountRef.current = messages.length;
    if (messages.length <= previous) return;

    const last = messages[messages.length - 1];
    if (previous === 0) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (atBottomRef.current || last.authorId === me.id) {
      scrollToBottom(true);
    } else if (last.kind !== "system") {
      setUnread((count) => count + 1);
    }
  }, [messages, me.id, scrollToBottom]);

  // Images and videos change height after their bytes arrive, which would
  // otherwise leave a just-sent photo half off-screen.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!atBottomRef.current) return;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // Reading = being at the bottom with the tab in front.
  useEffect(() => {
    if (!atBottomRef.current) return;
    if (document.visibilityState !== "visible") return;
    onMarkSeen();
  }, [messages, onMarkSeen]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && atBottomRef.current) onMarkSeen();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [onMarkSeen]);

  const jumpTo = useCallback((id: string) => {
    const node = document.getElementById(`msg-${id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(id);
    setTimeout(() => setHighlighted((current) => (current === id ? null : current)), 1600);
  }, []);

  // "Read by all" ignores the author, and offline members still count.
  const audienceSize = Math.max(0, members.length - 1);
  const typing = typers.filter((t) => t.id !== me.id);

  return (
    <div className="relative min-h-0 flex-1">
      <div className="chat-canvas pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-slim absolute inset-0 overflow-y-auto overscroll-contain py-3"
      >
        <ul ref={listRef} className="mx-auto flex max-w-4xl flex-col pb-2">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
            const grouped =
              !newDay &&
              previous?.kind !== "system" &&
              message.kind !== "system" &&
              previous?.authorId === message.authorId &&
              message.createdAt - previous.createdAt < GROUP_WINDOW_MS;

            return (
              <div key={message.id} className="contents">
                {newDay && (
                  <li className="my-3 flex justify-center">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-zinc-500 shadow-sm backdrop-blur dark:bg-zinc-800/80 dark:text-zinc-400">
                      {formatDayLabel(message.createdAt)}
                    </span>
                  </li>
                )}
                <MessageRow
                  message={message}
                  mine={message.authorId === me.id}
                  showAuthor={!grouped}
                  roomCode={roomCode}
                  myId={me.id}
                  audienceSize={audienceSize}
                  canDelete={message.authorId === me.id || me.id === hostId}
                  highlighted={highlighted === message.id}
                  onReply={onReply}
                  onReact={onReact}
                  onDelete={onDelete}
                  onRetry={onRetry}
                  onOpenImage={onOpenImage}
                  onJumpTo={jumpTo}
                />
              </div>
            );
          })}

          {typing.length > 0 && (
            <li className="mt-2 flex items-center gap-2 px-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex gap-1">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500"
                    style={{ animationDelay: `${dot * 120}ms` }}
                  />
                ))}
              </span>
              {typing.length === 1 ? `${typing[0].name} is typing` : `${typing.length} people are typing`}
            </li>
          )}
        </ul>
      </div>

      {(!atBottom || unread > 0) && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className={cx(
            "animate-pop absolute right-4 bottom-4 z-10 flex items-center gap-1.5 rounded-full py-2 pr-3 pl-2.5 text-sm font-medium shadow-lg transition",
            unread > 0
              ? "bg-teal-600 text-white hover:bg-teal-500"
              : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300",
          )}
        >
          <ArrowDownIcon width={16} height={16} />
          {unread > 0 && <span>{unread} new</span>}
        </button>
      )}
    </div>
  );
}
