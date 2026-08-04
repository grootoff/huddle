import QRCode from "qrcode";
import { normalizeRoomCode } from "@/lib/constants";
import { lanAddresses } from "../../../../server/net.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the URL other devices on this Wi-Fi should open, plus a QR code for
 * it. The requesting browser already reached us over a working address, so we
 * prefer its Host header and only fall back to interface sniffing.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = normalizeRoomCode(url.searchParams.get("code") ?? "");

  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const [hostname, port = url.port || "4000"] = splitHost(forwardedHost);

  const lan = lanAddresses();
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const bestHost = isLoopback ? (lan[0] ?? hostname) : hostname;

  const origin = `http://${bestHost}:${port}`;
  const joinUrl = code ? `${origin}/r/${code}` : origin;

  const qr = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  return Response.json({
    origin,
    joinUrl,
    qr,
    /** Every address a phone could try, in case the first one is the wrong NIC. */
    alternates: lan.map((ip) => `http://${ip}:${port}`),
    servedOverLan: !isLoopback,
  });
}

function splitHost(host: string): [string, string?] {
  // IPv6 literals arrive as [::1]:4000
  const match = /^\[(.+)\](?::(\d+))?$/.exec(host);
  if (match) return [match[1], match[2]];
  const [name, port] = host.split(":");
  return [name, port];
}
