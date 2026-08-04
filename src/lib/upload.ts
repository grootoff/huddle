"use client";

import { MAX_FILE_BYTES, MAX_FILE_MB } from "./constants";
import type { Attachment } from "./types";

export interface UploadHandle {
  done: Promise<Attachment>;
  abort: () => void;
}

export interface MediaMeta {
  width?: number;
  height?: number;
  duration?: number;
}

/**
 * XHR rather than fetch: it is still the only way to get upload progress
 * events, which matter when someone sends a 60 MB video over Wi-Fi.
 */
export function uploadFile(args: {
  blob: Blob;
  name: string;
  roomCode: string;
  token: string;
  meta?: MediaMeta;
  onProgress?: (fraction: number) => void;
}): UploadHandle {
  const xhr = new XMLHttpRequest();

  const done = new Promise<Attachment>((resolve, reject) => {
    if (args.blob.size > MAX_FILE_BYTES) {
      reject(new Error(`That file is larger than ${MAX_FILE_MB} MB`));
      return;
    }

    xhr.open("PUT", "/api/upload", true);
    xhr.setRequestHeader("Content-Type", args.blob.type || "application/octet-stream");
    xhr.setRequestHeader("x-huddle-room", args.roomCode);
    xhr.setRequestHeader("x-huddle-token", args.token);
    // Header values must be latin-1, and file names are not.
    xhr.setRequestHeader("x-huddle-name", encodeURIComponent(args.name));
    if (args.meta?.width) xhr.setRequestHeader("x-huddle-width", String(Math.round(args.meta.width)));
    if (args.meta?.height) xhr.setRequestHeader("x-huddle-height", String(Math.round(args.meta.height)));
    if (args.meta?.duration) xhr.setRequestHeader("x-huddle-duration", args.meta.duration.toFixed(2));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) args.onProgress?.(event.loaded / event.total);
    };

    xhr.onload = () => {
      let payload: unknown;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        args.onProgress?.(1);
        resolve(payload as Attachment);
      } else {
        reject(new Error((payload as { error?: string } | null)?.error ?? `Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      // A server that rejects early (too large, room full) may close the connection
      // while we are still sending, which surfaces here rather than in onload.
      if (xhr.status === 413) reject(new Error(`That file is larger than ${MAX_FILE_MB} MB`));
      else if (xhr.status === 507) reject(new Error("This huddle has run out of space"));
      else if (xhr.status >= 400) reject(new Error(`Upload rejected (${xhr.status})`));
      else reject(new Error("Upload failed — is the host still on this network?"));
    };
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(args.blob);
  });

  return { done, abort: () => xhr.abort() };
}

/** Reads intrinsic dimensions so bubbles don't jump when media loads. */
export async function probeMedia(file: Blob): Promise<MediaMeta> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const image = await loadElement(Object.assign(new Image(), { src: url }), "load");
      return { width: image.naturalWidth, height: image.naturalHeight };
    }
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = url;
      await loadElement(video, "loadedmetadata");
      return { width: video.videoWidth, height: video.videoHeight, duration: safeDuration(video.duration) };
    }
    if (file.type.startsWith("audio/")) {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.src = url;
      await loadElement(audio, "loadedmetadata");
      return { duration: safeDuration(audio.duration) };
    }
    return {};
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

function safeDuration(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function loadElement<T extends HTMLElement>(element: T, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe timed out")), 4000);
    element.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve(element);
      },
      { once: true },
    );
    element.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("probe failed"));
      },
      { once: true },
    );
  });
}
