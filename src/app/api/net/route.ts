import QRCode from "qrcode";
import { normalizeRoomCode } from "@/lib/constants";
import { corsHeaders, preflight } from "@/lib/cors";
import { lanAddresses } from "../../../../server/net.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request): Response {
  return preflight(request);
}

/**
 * Returns the URL other people should open, plus a QR code for it.
 *
 * On a LAN the requesting browser already reached us over a working address, so
 * its Host header is the best answer and interface sniffing is the fallback. In a
 * split deployment the page lives somewhere else entirely, so the caller passes
 * the origin it wants advertised — the backend host would be the wrong link.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = normalizeRoomCode(url.searchParams.get("code") ?? "");
  const cors = corsHeaders(request);

  const advertised = safeOrigin(url.searchParams.get("origin"));
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const [hostname, port = url.port || "4000"] = splitHost(forwardedHost);

  const lan = lanAddresses();
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const bestHost = isLoopback ? (lan[0] ?? hostname) : hostname;

  const scheme = request.headers.get("x-forwarded-proto") ?? "http";
  const origin = advertised ?? `${scheme}://${bestHost}${port ? `:${port}` : ""}`;
  const joinUrl = code ? `${origin}/r/${code}` : origin;

  const qr = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  return Response.json(
    {
      origin,
      joinUrl,
      qr,
      /** Every address a phone could try, in case the first one is the wrong NIC. */
      alternates: advertised ? [] : lan.map((ip) => `${scheme}://${ip}:${port}`),
      servedOverLan: advertised ? true : !isLoopback,
    },
    { headers: cors },
  );
}

/** Only ever used as QR/link text, but still worth pinning to a sane shape. */
function safeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function splitHost(host: string): [string, string?] {
  // IPv6 literals arrive as [::1]:4000
  const match = /^\[(.+)\](?::(\d+))?$/.exec(host);
  if (match) return [match[1], match[2]];
  const [name, port] = host.split(":");
  return [name, port];
}
