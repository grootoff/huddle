import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getBridge } from "@/lib/bridge";
import { ROOM_CODE_PATTERN } from "@/lib/constants";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StoredMeta extends Attachment {
  roomCode: string;
  createdAt: number;
}

/**
 * Streams an uploaded file. Range requests are honoured so audio/video can be
 * seeked and so iOS Safari (which always probes with a Range) can play media.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string; id: string }> },
): Promise<Response> {
  const bridge = getBridge();
  if (!bridge) return new Response("Starting up", { status: 503 });

  const { code, id } = await context.params;
  if (!ROOM_CODE_PATTERN.test(code)) return new Response("Not found", { status: 404 });
  // Ids are server-generated UUIDs; the check also blocks path traversal.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const file = path.join(bridge.uploadDir, code, id);
  let meta: StoredMeta;
  let size: number;
  try {
    meta = JSON.parse(await readFile(`${file}.json`, "utf8")) as StoredMeta;
    size = (await stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (meta.roomCode !== code) return new Response("Not found", { status: 404 });

  const wantsDownload = new URL(request.url).searchParams.has("download");
  const disposition = wantsDownload || meta.kind === "file" ? "attachment" : "inline";
  const headers = new Headers({
    "Content-Type": meta.mime || "application/octet-stream",
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
    "Accept-Ranges": "bytes",
    // Content at a given id never changes.
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });

  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  if (request.method === "HEAD") {
    headers.set("Content-Length", String(size));
    return new Response(null, { status: 200, headers });
  }

  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);

  const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: range ? 206 : 200, headers });
}

export const HEAD = GET;

function parseRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;
  if (!rawStart) {
    // Suffix range: last N bytes.
    const length = Number(rawEnd);
    if (length <= 0) return "unsatisfiable";
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return "unsatisfiable";
  return { start, end };
}
