"use client";

import { useEffect } from "react";
import { DownloadIcon, XIcon } from "./icons";

export function Lightbox({
  src,
  name,
  downloadUrl,
  onClose,
}: {
  src: string;
  name: string;
  downloadUrl?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-70 flex flex-col bg-zinc-950/92 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-4 p-3 text-white">
        <p className="min-w-0 truncate text-sm">{name}</p>
        <div className="flex items-center gap-1">
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={name}
              title="Download"
              aria-label="Download"
              className="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
            >
              <DownloadIcon />
            </a>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
          >
            <XIcon />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} className="animate-pop max-h-full max-w-full rounded-lg object-contain" />
      </div>
    </div>
  );
}
