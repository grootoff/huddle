"use client";

import { memo, useEffect, useState } from "react";
import type { ChatMessage } from "@/hooks/useRoom";
import { REACTION_EMOJIS } from "@/lib/constants";
import { formatClock, linkify } from "@/lib/format";
import { Avatar } from "./Avatar";
import { AttachmentView } from "./AttachmentView";
import { CheckCheckIcon, CheckIcon, ReplyIcon, SmileIcon, TrashIcon } from "./icons";
import { cx } from "./ui";

interface Props {
  message: ChatMessage;
  mine: boolean;
  /** False when this bubble continues a run from the same person. */
  showAuthor: boolean;
  roomCode: string;
  myId: string;
  /** Everyone still in the room, used to decide "read by all". */
  audienceSize: number;
  canDelete: boolean;
  highlighted: boolean;
  onReply: (message: ChatMessage) => void;
  onReact: (id: string, emoji: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onOpenImage: (src: string, name: string, downloadUrl?: string) => void;
  onJumpTo: (id: string) => void;
}

export const MessageRow = memo(function MessageRow({
  message,
  mine,
  showAuthor,
  roomCode,
  myId,
  audienceSize,
  canDelete,
  highlighted,
  onReply,
  onReact,
  onDelete,
  onRetry,
  onOpenImage,
  onJumpTo,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  /** Deleting is for everyone and cannot be undone, so it asks once. */
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  if (message.kind === "system") {
    return (
      <li className="my-3 flex justify-center px-4">
        <span className="rounded-full bg-zinc-900/[0.06] px-3 py-1 text-center text-xs text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
          {message.body}
        </span>
      </li>
    );
  }

  const reactionEntries = Object.entries(message.reactions).filter(([, ids]) => ids.length > 0);
  const isImageOnly = !message.body && message.attachment?.kind === "image";

  return (
    <li
      id={`msg-${message.id}`}
      className={cx(
        "group/row flex gap-2 px-3 sm:px-4",
        mine ? "flex-row-reverse" : "flex-row",
        showAuthor ? "mt-2.5" : "mt-0.5",
        highlighted && "animate-pop rounded-lg bg-teal-500/10 py-1",
      )}
    >
      {!mine && (
        <div className="w-9 shrink-0 self-end">
          {showAuthor && <Avatar name={message.authorName} color={message.authorColor} size={36} />}
        </div>
      )}

      <div className={cx("flex min-w-0 max-w-[min(78%,34rem)] flex-col", mine ? "items-end" : "items-start")}>
        <div
          onClick={() => setTouchOpen((open) => !open)}
          className={cx(
            "relative w-fit min-w-0 shadow-sm transition",
            isImageOnly ? "overflow-hidden rounded-2xl" : "px-3 py-2",
            !isImageOnly && "rounded-2xl",
            mine
              ? cx("bg-teal-600 text-white", showAuthor && !isImageOnly && "rounded-br-md")
              : cx(
                  "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
                  showAuthor && !isImageOnly && "rounded-bl-md",
                ),
            message.status === "failed" && "ring-2 ring-rose-400",
          )}
        >
          {showAuthor && !mine && (
            <p className="mb-0.5 text-[13px] font-semibold" style={{ color: message.authorColor }}>
              {message.authorName}
            </p>
          )}

          {message.replyTo && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onJumpTo(message.replyTo!.id);
              }}
              className={cx(
                "mb-1.5 block w-full max-w-full rounded-lg border-l-[3px] px-2 py-1 text-left text-xs",
                mine
                  ? "border-white/60 bg-white/15 text-white/90"
                  : "border-teal-500 bg-zinc-900/[0.04] text-zinc-600 dark:bg-white/5 dark:text-zinc-300",
              )}
            >
              <span className="block font-medium">{message.replyTo.authorName}</span>
              <span className="line-clamp-2 opacity-80">{message.replyTo.preview}</span>
            </button>
          )}

          {message.deleted ? (
            <p className={cx("text-sm italic", mine ? "text-white/70" : "text-zinc-400")}>This message was deleted</p>
          ) : (
            <>
              {message.attachment && (
                <div className={cx(message.body && "mb-1.5", isImageOnly && "")}>
                  <AttachmentView
                    attachment={message.attachment}
                    roomCode={roomCode}
                    localUrl={message.localUrl}
                    progress={message.progress}
                    mine={mine}
                    onOpenImage={onOpenImage}
                  />
                </div>
              )}
              {message.body && (
                <p className="msg-text text-[15px] leading-relaxed">
                  {linkify(message.body).map((part, index) =>
                    part.type === "link" ? (
                      <a
                        key={index}
                        href={part.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={(event) => event.stopPropagation()}
                        className={cx("underline underline-offset-2", mine ? "text-white" : "text-teal-700 dark:text-teal-400")}
                      >
                        {part.value}
                      </a>
                    ) : (
                      <span key={index}>{part.value}</span>
                    ),
                  )}
                </p>
              )}
            </>
          )}

          <div
            className={cx(
              "mt-0.5 flex items-center justify-end gap-1 text-[11px] select-none",
              isImageOnly && "absolute right-1.5 bottom-1.5 rounded-full bg-zinc-950/50 px-1.5 py-0.5 text-white",
              mine ? "text-white/70" : "text-zinc-400",
            )}
          >
            <span>{formatClock(message.createdAt)}</span>
            {mine && <Ticks message={message} audienceSize={audienceSize} onRetry={onRetry} />}
          </div>
        </div>

        {reactionEntries.length > 0 && (
          <div className={cx("-mt-1.5 flex flex-wrap gap-1", mine ? "mr-1 justify-end" : "ml-1")}>
            {reactionEntries.map(([emoji, ids]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message.id, emoji)}
                title={`${ids.length} ${ids.length === 1 ? "person" : "people"}`}
                className={cx(
                  "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs shadow-sm transition",
                  ids.includes(myId)
                    ? "border-teal-400 bg-teal-50 dark:border-teal-500 dark:bg-teal-500/20"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800",
                )}
              >
                <span>{emoji}</span>
                {ids.length > 1 && <span className="text-[10px] text-zinc-500">{ids.length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions: hover on desktop, tap-to-reveal on touch. */}
      <div
        className={cx(
          "flex items-center gap-0.5 self-center transition-opacity",
          touchOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100",
        )}
      >
        {!message.deleted && !message.status && (
          <>
            <div className="relative">
              <ActionButton label="React" onClick={() => setPickerOpen((open) => !open)}>
                <SmileIcon width={16} height={16} />
              </ActionButton>
              {pickerOpen && (
                <div
                  className={cx(
                    "animate-pop absolute bottom-9 z-20 flex gap-0.5 rounded-full border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800",
                    mine ? "right-0" : "left-0",
                  )}
                >
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(message.id, emoji);
                        setPickerOpen(false);
                      }}
                      className="rounded-full px-1.5 py-0.5 text-lg transition hover:scale-125 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ActionButton label="Reply" onClick={() => onReply(message)}>
              <ReplyIcon width={16} height={16} />
            </ActionButton>
          </>
        )}
        {(canDelete || message.status === "failed") &&
          !message.deleted &&
          (confirmDelete ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setConfirmDelete(false);
                onDelete(message.id);
              }}
              className="animate-pop rounded-full bg-rose-600 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white shadow-sm hover:bg-rose-500"
            >
              Delete?
            </button>
          ) : (
            <ActionButton
              label={message.status === "failed" ? "Discard" : "Delete for everyone"}
              onClick={() => {
                // Unsent drafts are local, so they need no confirmation.
                if (message.status === "failed") onDelete(message.id);
                else setConfirmDelete(true);
              }}
            >
              <TrashIcon width={16} height={16} />
            </ActionButton>
          ))}
      </div>
    </li>
  );
});

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex size-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-900/10 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
    >
      {children}
    </button>
  );
}

/** Sent / delivered / read, WhatsApp style. */
function Ticks({
  message,
  audienceSize,
  onRetry,
}: {
  message: ChatMessage;
  audienceSize: number;
  onRetry: (id: string) => void;
}) {
  if (message.status === "sending") {
    return <span className="size-3 animate-pulse rounded-full border border-current opacity-70" title="Sending" />;
  }
  if (message.status === "failed") {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRetry(message.id);
        }}
        className="font-medium underline underline-offset-2"
      >
        Retry
      </button>
    );
  }
  const seen = message.seenBy.length;
  if (seen === 0) return <CheckIcon width={14} height={14} aria-label="Sent" />;
  const readByAll = audienceSize > 0 && seen >= audienceSize;
  return (
    <CheckCheckIcon
      width={16}
      height={16}
      aria-label={readByAll ? "Read by everyone" : `Read by ${seen}`}
      className={readByAll ? "text-sky-200" : ""}
    />
  );
}
