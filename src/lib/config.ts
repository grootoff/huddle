/**
 * Where the realtime + file backend lives.
 *
 * Empty (the default) means "same origin as this page", which is how Huddle runs
 * on a LAN: one process serves the UI, the socket and the files on one port.
 *
 * Set NEXT_PUBLIC_HUDDLE_SERVER at build time to point a statically hosted UI
 * (Netlify, Vercel, GitHub Pages, a CDN) at a backend running somewhere that can
 * actually hold a WebSocket open. The value is baked into the client bundle, so
 * it must be set before `next build`, not at runtime.
 */
const configured = (process.env.NEXT_PUBLIC_HUDDLE_SERVER ?? "").trim().replace(/\/+$/, "");

/** "" when the backend is same-origin. */
export const SERVER_ORIGIN = configured;

/** True when the UI and the backend are on different hosts. */
export const IS_SPLIT_DEPLOY = configured.length > 0;

/** Absolute URL for a backend path, or a relative one when same-origin. */
export function apiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${SERVER_ORIGIN}${suffix}`;
}
