/**
 * Cross-origin support for split deployments (UI on Netlify, backend elsewhere).
 *
 * Off unless HUDDLE_ALLOWED_ORIGINS is set on the backend, so a LAN install keeps
 * its endpoints same-origin-only. Never `*`: the upload route accepts a session
 * token in a header, and a wildcard would let any page on the internet spend it.
 */

const UPLOAD_HEADERS = [
  "content-type",
  "x-huddle-room",
  "x-huddle-token",
  "x-huddle-name",
  "x-huddle-mime",
  "x-huddle-width",
  "x-huddle-height",
  "x-huddle-duration",
].join(", ");

export function allowedOrigins(): string[] {
  return (process.env.HUDDLE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** CORS headers for this request, or {} when the origin is not on the allowlist. */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (!allowedOrigins().includes(origin.replace(/\/+$/, ""))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, PUT, OPTIONS",
    "Access-Control-Allow-Headers": UPLOAD_HEADERS,
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function preflight(request: Request): Response {
  const headers = corsHeaders(request);
  // No headers means the origin is not allowed — the browser will block it.
  return new Response(null, { status: Object.keys(headers).length ? 204 : 403, headers });
}
