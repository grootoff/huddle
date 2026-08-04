"use client";

import { useEffect, useRef, useState } from "react";
import { fileUrl, formatBytes, formatDuration } from "@/lib/format";
import type { Attachment } from "@/lib/types";
import { DownloadIcon, FileIcon, PauseIcon, PlayIcon } from "./icons";
import { cx } from "./ui";

interface Props {
  attachment: Attachment;
  roomCode: string;
  /** Blob URL used while the file is still uploading. */
  localUrl?: string;
  /** 0–1 while uploading, undefined once stored. */
  progress?: number;
  mine: boolean;
  onOpenImage?: (src: string, name: string, downloadUrl?: string) => void;
}

export function AttachmentView({ attachment, roomCode, localUrl, progress, mine, onOpenImage }: Props) {
  const pending = attachment.id === "pending" || progress !== undefined;
  const src = pending ? localUrl : fileUrl(roomCode, attachment.id);
  const download = pending ? undefined : fileUrl(roomCode, attachment.id, true);

  if (attachment.kind === "image" && src) {
    const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 4 / 3;
    return (
      <figure className="relative overflow-hidden rounded-xl">
        <button
          type="button"
          onClick={() => onOpenImage?.(src, attachment.name, download)}
          className="block w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={attachment.name}
            loading="lazy"
            decoding="async"
            style={{ aspectRatio: String(ratio) }}
            className="max-h-[420px] w-full bg-zinc-200/70 object-cover dark:bg-zinc-800"
          />
        </button>
        <UploadVeil progress={progress} />
      </figure>
    );
  }

  if (attachment.kind === "video" && src) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-black/90">
        <video
          src={src}
          controls
          preload="metadata"
          playsInline
          className="max-h-[420px] w-full"
          style={attachment.width && attachment.height ? { aspectRatio: `${attachment.width}/${attachment.height}` } : undefined}
        />
        <UploadVeil progress={progress} />
      </div>
    );
  }

  if (attachment.kind === "audio" && src) {
    return <AudioBubble src={src} attachment={attachment} mine={mine} progress={progress} />;
  }

  return (
    <a
      href={download ?? src ?? "#"}
      download={attachment.name}
      className={cx(
        "flex items-center gap-3 rounded-xl p-2.5 transition",
        mine ? "bg-white/15 hover:bg-white/25" : "bg-zinc-900/[0.04] hover:bg-zinc-900/[0.08] dark:bg-white/5 dark:hover:bg-white/10",
        pending && "pointer-events-none",
      )}
    >
      <span
        className={cx(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          mine ? "bg-white/20 text-white" : "bg-teal-600/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
        )}
      >
        <FileIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{attachment.name}</span>
        <span className={cx("block text-xs", mine ? "text-white/70" : "text-zinc-500")}>
          {progress !== undefined && progress < 1
            ? `${Math.round(progress * 100)}% uploaded`
            : formatBytes(attachment.size)}
        </span>
      </span>
      {!pending && <DownloadIcon className={mine ? "text-white/80" : "text-zinc-400"} />}
    </a>
  );
}

/** Progress wash drawn over media while its bytes are still going out. */
function UploadVeil({ progress }: { progress?: number }) {
  if (progress === undefined || progress >= 1) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/45 backdrop-blur-[1px]">
      <div className="w-24">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-1.5 text-center text-[11px] font-medium text-white">{Math.round(progress * 100)}%</p>
      </div>
    </div>
  );
}

/** Compact voice-note player: play/pause, scrubber, elapsed time. */
function AudioBubble({
  src,
  attachment,
  mine,
  progress,
}: {
  src: string;
  attachment: Attachment;
  mine: boolean;
  progress?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(attachment.duration ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setElapsed(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setElapsed(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const fraction = total > 0 ? Math.min(1, elapsed / total) : 0;
  const isVoiceNote = /^voice-/.test(attachment.name);

  return (
    <div className="flex min-w-[210px] items-center gap-3 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        disabled={progress !== undefined && progress < 1}
        className={cx(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50",
          mine ? "bg-white/20 text-white hover:bg-white/30" : "bg-teal-600 text-white hover:bg-teal-500",
        )}
      >
        {playing ? <PauseIcon width={16} height={16} /> : <PlayIcon width={16} height={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(fraction * 100)}
          aria-label="Seek"
          onChange={(event) => {
            const audio = audioRef.current;
            if (!audio || !total) return;
            audio.currentTime = (Number(event.target.value) / 100) * total;
            setElapsed(audio.currentTime);
          }}
          className={cx("h-1.5 w-full cursor-pointer appearance-none rounded-full", mine ? "accent-white" : "accent-teal-600")}
          style={{
            background: `linear-gradient(to right, currentColor ${fraction * 100}%, color-mix(in oklab, currentColor 25%, transparent) ${fraction * 100}%)`,
          }}
        />
        <div className={cx("mt-1 flex justify-between text-[11px]", mine ? "text-white/75" : "text-zinc-500")}>
          <span>{isVoiceNote ? "Voice message" : attachment.name}</span>
          <span className="font-mono">{formatDuration(playing || elapsed > 0 ? elapsed : total)}</span>
        </div>
      </div>
    </div>
  );
}
