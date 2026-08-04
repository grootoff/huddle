import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getBridge } from "@/lib/bridge";
import { MAX_FILE_BYTES } from "@/lib/constants";
import type { Attachment, AttachmentKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Raw-body upload: the client PUTs the file bytes with metadata in headers.
 * That avoids buffering a 100 MB multipart body in memory and gives the
 * browser real upload progress (XHR), which multipart + fetch cannot.
 */
export async function PUT(request: Request): Promise<Response> {
  const bridge = getBridge();
  if (!bridge) return bad(503, "Server is still starting up");

  const roomCode = (request.headers.get("x-huddle-room") ?? "").replace(/\D/g, "");
  const token = request.headers.get("x-huddle-token") ?? "";
  if (!/^\d{6}$/.test(roomCode)) return bad(400, "Bad room code");
  if (!bridge.roomExists(roomCode)) return bad(404, "That huddle no longer exists");
  if (!token || !bridge.memberIdForToken(roomCode, token)) return bad(401, "Join the huddle before uploading");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES) return bad(413, "That file is larger than 100 MB");
  if (!request.body) return bad(400, "Empty upload");

  const mime = (request.headers.get("x-huddle-mime") || request.headers.get("content-type") || "application/octet-stream")
    .split(";")[0]
    .trim();
  const name = sanitizeName(decodeHeader(request.headers.get("x-huddle-name")) || "file");

  const id = randomUUID();
  const dir = path.join(bridge.uploadDir, roomCode);
  const dest = path.join(dir, id);
  await mkdir(dir, { recursive: true });

  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > MAX_FILE_BYTES) {
        done(new Error("TOO_LARGE"));
        return;
      }
      done(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
      meter,
      createWriteStream(dest),
    );
  } catch (error) {
    await rm(dest, { force: true });
    if (error instanceof Error && error.message === "TOO_LARGE") return bad(413, "That file is larger than 100 MB");
    console.error("[huddle] upload failed:", error);
    return bad(500, "Upload failed");
  }

  if (bytes === 0) {
    await rm(dest, { force: true });
    return bad(400, "That file is empty");
  }

  const attachment: Attachment = {
    id,
    name,
    size: bytes,
    mime,
    kind: kindOf(mime, name),
    width: positive(request.headers.get("x-huddle-width")),
    height: positive(request.headers.get("x-huddle-height")),
    duration: positive(request.headers.get("x-huddle-duration")),
  };

  // Sidecar metadata lets the download route serve the file without touching
  // the database (which lives in the other module graph).
  await writeFile(`${dest}.json`, JSON.stringify({ ...attachment, roomCode, createdAt: Date.now() }), "utf8");

  return Response.json(attachment, { status: 201 });
}

function bad(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function decodeHeader(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Display-only cleanup: strip control characters (they can smuggle newlines
 * into headers/UI) and flatten path separators. Bytes are stored under a UUID,
 * so this never affects where the file lands on disk.
 */
function sanitizeName(raw: string): string {
  const printable = Array.from(raw)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("");
  return printable.replace(/[/\\]/g, "-").trim().slice(0, 200) || "file";
}

function positive(value: string | null): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : undefined;
}

function kindOf(mime: string, name: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(name)) return "image";
  return "file";
}
