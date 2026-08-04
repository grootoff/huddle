"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/hooks/useRoom";
import { MAX_MESSAGE_CHARS } from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import { MicIcon, PaperclipIcon, SendIcon, SmileIcon, TrashIcon, XIcon } from "./icons";
import { IconButton, cx } from "./ui";

const EMOJI = [
  "😀","😄","😁","😂","🤣","😊","🙂","😉","😍","😘","😜","🤪","🤗","🤔","🤨","😐","😴","😷","🤒","🥳",
  "😎","🤩","🥺","😢","😭","😤","😠","😡","🤯","😱","🤗","🙄","😬","🤝","🙏","👍","👎","👌","✌️","🤞",
  "💪","👏","🙌","🎉","🔥","✨","⭐","💯","❤️","🧡","💚","💙","💜","🖤","💔","☕","🍕","🍺","🎂","🎁",
  "⚽","🏀","🎮","🎧","📷","💻","📱","🚗","✈️","🏠","☀️","🌧️","❄️","🌈","👀","🤖","💡","⏰","✅","❌",
];

interface Props {
  onSend: (text: string) => void;
  onFiles: (files: File[]) => void;
  onVoice: (blob: Blob, seconds: number) => void;
  onTyping: (isTyping: boolean) => void;
  onError: (message: string) => void;
  reply: ChatMessage | null;
  onCancelReply: () => void;
  disabled?: boolean;
}

export function Composer({ onSend, onFiles, onVoice, onTyping, onError, reply, onCancelReply, disabled }: Props) {
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);

  // Grow with content, up to ~6 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [text]);

  useEffect(() => {
    if (reply) textareaRef.current?.focus();
  }, [reply]);

  const stopTyping = () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingActive.current) {
      typingActive.current = false;
      onTyping(false);
    }
  };

  useEffect(() => stopTyping, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (value: string) => {
    setText(value.slice(0, MAX_MESSAGE_CHARS));
    if (!typingActive.current && value.trim()) {
      typingActive.current = true;
      onTyping(true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 2500);
  };

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
    stopTyping();
    setEmojiOpen(false);
    textareaRef.current?.focus();
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((current) => current + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(next.slice(0, MAX_MESSAGE_CHARS));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  };

  return (
    <div className="relative border-t border-zinc-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      {reply && (
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 pt-2 sm:px-4">
          <div className="min-w-0 flex-1 rounded-lg border-l-[3px] border-teal-500 bg-zinc-100 px-2.5 py-1.5 text-xs dark:bg-zinc-800">
            <p className="font-medium text-teal-700 dark:text-teal-400">Replying to {reply.authorName}</p>
            <p className="truncate text-zinc-500 dark:text-zinc-400">
              {reply.body || reply.attachment?.name || "Attachment"}
            </p>
          </div>
          <IconButton label="Cancel reply" onClick={onCancelReply}>
            <XIcon width={16} height={16} />
          </IconButton>
        </div>
      )}

      {emojiOpen && (
        <div className="mx-auto max-w-4xl px-3 pt-2 sm:px-4">
          <div className="animate-rise scroll-slim grid max-h-40 grid-cols-10 gap-0.5 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-800">
            {EMOJI.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="rounded-lg p-1 text-xl transition hover:scale-110 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-4xl items-end gap-1.5 px-2 py-2 sm:px-4 sm:py-3">
        <IconButton
          label="Emoji"
          onClick={() => setEmojiOpen((open) => !open)}
          className={emojiOpen ? "bg-zinc-900/5 text-teal-600 dark:bg-white/10" : undefined}
        >
          <SmileIcon />
        </IconButton>

        <IconButton label="Attach a file" onClick={() => fileInputRef.current?.click()}>
          <PaperclipIcon />
        </IconButton>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) onFiles(files);
            event.target.value = "";
          }}
        />

        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          disabled={disabled}
          placeholder="Message"
          aria-label="Message"
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="scroll-slim max-h-[150px] min-h-10 flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-[15px] leading-6 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:bg-zinc-800"
        />

        {text.trim() ? (
          <button
            type="button"
            onClick={submit}
            aria-label="Send"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm transition hover:bg-teal-500 active:scale-95"
          >
            <SendIcon />
          </button>
        ) : (
          <VoiceButton onRecorded={onVoice} onError={onError} />
        )}
      </div>
    </div>
  );
}

/** Tap to record, tap again to send. Cancel discards the clip. */
function VoiceButton({
  onRecorded,
  onError,
}: {
  onRecorded: (blob: Blob, seconds: number) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  const start = async () => {
    // Browsers only expose the microphone in a secure context. Over the LAN this
    // app is plain http, so say why instead of failing silently.
    if (!window.isSecureContext) {
      onError("Voice notes need https (or localhost) — your browser blocks the mic over plain http");
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("This browser cannot record audio");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!cancelledRef.current && blob.size > 0 && elapsed >= 0.6) onRecorded(blob, elapsed);
        setRecording(false);
        setSeconds(0);
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      onError("Microphone access was blocked");
    }
  };

  const finish = (cancelled: boolean) => {
    cancelledRef.current = cancelled;
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  if (!recording) {
    return (
      <IconButton label="Record a voice message" onClick={() => void start()}>
        <MicIcon />
      </IconButton>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-rose-50 px-2 py-1 dark:bg-rose-500/10">
      <span className="size-2 animate-pulse rounded-full bg-rose-500" />
      <span className="font-mono text-xs text-rose-700 tabular-nums dark:text-rose-300">{formatDuration(seconds)}</span>
      <IconButton label="Discard recording" onClick={() => finish(true)} className="size-8 text-rose-600">
        <TrashIcon width={16} height={16} />
      </IconButton>
      <button
        type="button"
        onClick={() => finish(false)}
        aria-label="Send recording"
        className={cx(
          "flex size-8 items-center justify-center rounded-full bg-teal-600 text-white transition hover:bg-teal-500",
        )}
      >
        <SendIcon width={16} height={16} />
      </button>
    </div>
  );
}
