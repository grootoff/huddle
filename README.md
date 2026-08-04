# Huddle

A private, WhatsApp-style chat room for everyone on the same Wi-Fi. One person runs
it, shares an 8-character code like `8GNY S8UT` (or a QR), and anyone on the network
joins from a browser with just their name. No accounts, no cloud — messages and files
never leave the machine that hosts it.

```bash
npm install
npm run build
npm start            # http://localhost:4000 + your LAN address, printed on boot
```

Hand out the LAN address it prints (e.g. `http://192.168.1.24:4000`). Everyone lands
on the same page: **Start one** creates a room, **Join a huddle** enters a code.

`npm run dev` exists for working on the code, but **use `npm start` when other people
are actually joining** — dev mode ships an unminified bundle plus HMR to every phone
on the network, and Next guards its dev assets by origin.

Needs **Node 24** (the server runs TypeScript directly and uses the built-in
`node:sqlite`); `npm run dev`/`npm start` check this and tell you if not.

## What it does

**Rooms** — the host gets one 8-character code that is both the room's address and its
only secret (33^8 ≈ 1.4 × 10¹² possibilities, drawn from a CSPRNG). `I`, `L` and `O` are
left out of the alphabet because they are indistinguishable from `1` and `0` on a phone,
and typing them is folded automatically, so `8gnys8ut`, `8GNYS8UT` and `8GNY S8UT` all
open the same room. The host can lock the room once everyone has arrived, and remove
people. Treat the code like a password: anyone who has it can walk in.

**Joining** — nobody is anonymous: the name prompt comes before the room. The server
issues a session token that the browser keeps, so a refresh (or a phone locking) drops
you back in as the same person with the same history.

**Chat** — live messages, typing indicators, presence, replies with quoted previews,
emoji reactions, delete-for-everyone (with a confirm), read receipts (✓ sent, ✓✓ read,
lighter ✓✓ once everyone has read), day separators, message grouping, link detection,
unread pill, tab badge and a soft chime when the tab is in the background.

**Files** — drag anywhere, paste from the clipboard, or use the paperclip. Up to 100 MB
each, streamed straight to disk with real upload progress. Images and videos preview
inline (tap an image for a lightbox), audio gets a compact player, everything else
becomes a download card. Video and audio support range requests, so seeking works.

**Voice notes** — tap the mic, tap again to send. See the caveat below.

**Invite panel** — big room code, copyable link, and a QR code that points at the LAN
address the browser is actually using, so a phone camera can join in one scan.

Dark and light themes, and the layout is built for phones first (the composer stays
above the keyboard, tap a bubble to reveal its actions).

## How it is put together

One Node process serves everything on one port — that matters, because a single URL is
all you can realistically read out loud or put on a QR code.

| Piece | Choice |
| --- | --- |
| UI | Next.js 16 (App Router), React 19, Tailwind v4 |
| Realtime | Socket.IO 4 attached to the same HTTP server (`server/index.ts`) |
| Storage | `node:sqlite` (built into Node 22.6+), WAL mode — no native modules to build |
| Uploads | `PUT /api/upload` with the raw body + metadata headers, streamed to disk |
| TypeScript | run directly by Node's built-in type stripping — no tsx, no build step for the server |

```
server/            the long-lived process: http + socket.io + sqlite
  index.ts         boot, LAN banner, janitor, graceful shutdown
  socket.ts        every realtime event, validated with zod and rate limited
  store.ts         all SQL and room rules (the only place that touches the db)
  ids.ts           codes, tokens, scrypt key hashing, avatar colours
src/
  app/             pages + the three HTTP routes (upload, download, net/QR)
  components/      chat UI
  hooks/useRoom.ts one hook holding room state, optimistic sends and reconnects
  lib/             shared types, constants, formatting, upload client
data/              created on first run: huddle.db + uploads/<room code>/
```

Route handlers are bundled by Next and therefore live in a different module graph from
the socket server, so they reach the single SQLite handle through a small `globalThis`
bridge (`src/lib/bridge.ts`) instead of opening a second connection.

Rooms nobody has opened for two days are dropped automatically, files included.

## If it will not start

`npm run dev` checks your Node version first and explains itself, but three things
account for almost every failure:

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Unknown file extension ".ts"` | Node older than 23.6 — the server runs TypeScript directly | `nvm install 24 && nvm use 24` |
| `Another next dev server is already running` | a previous run left a lock in `.next/dev`, or one really is running | `rm -rf .next/dev`, or stop the other process |
| `Port 4000 is already in use` | something else has the port | `lsof -nP -iTCP:4000 -sTCP:LISTEN`, or `PORT=4001 npm run dev` |
| Opens from another device but never finishes loading | Next blocks its dev assets from unknown origins | handled by `allowedDevOrigins` in `next.config.ts`; restart after changing networks, or just use `npm start` |

Phones on the network cannot reach it? Check the machine's firewall (macOS: System
Settings → Network → Firewall) and that both devices are on the same subnet — guest
Wi-Fi networks usually isolate clients from each other.

## Hosting it somewhere other than your laptop

**Netlify and Vercel cannot run the backend.** Huddle is a single long-lived process that
holds open WebSocket connections, keeps presence in memory, and writes SQLite plus
uploaded files to a disk. Those platforms run stateless serverless functions:
`server/index.ts` never boots, Functions do not accept WebSocket upgrades, and the
filesystem is thrown away between invocations. Deploy the repo to Netlify as-is and you
get a page that loads and then hangs on "create room", because the socket never connects.

They *can* host the UI, though. See "Netlify (or any static host) for the UI" below.

### A container host runs the whole thing

This is the simple path. A `Dockerfile` and a `fly.toml` are included:

```bash
fly launch --no-deploy                        # reads fly.toml
fly volumes create huddle_data --size 3       # chat history + uploads live here
fly deploy
```

Railway, Render (Docker + a persistent disk), Coolify, or a plain VPS behind Caddy work
the same way. Two rules on any of them:

- **One instance only.** Presence and typing live in memory and the database is a local
  file, so a second replica would show a different set of rooms. Scale the machine up,
  never out. `fly.toml` pins `max_machines_running = 1`.
- **Mount a volume at `HUDDLE_DATA_DIR`** (`/data` in the container) or every redeploy
  wipes the history and the uploads.

A hosted deployment gets you HTTPS, which is also what makes **voice notes work on
phones** — see the caveat below.

If you only want a public link to something running on your own machine, a tunnel is
less work than deploying and keeps the data local:

```bash
cloudflared tunnel --url http://localhost:4000     # or: ngrok http 4000
```

### Netlify (or any static host) for the UI

If the URL has to be `something.netlify.app`, host the UI there and point it at a backend
that can hold sockets open. `netlify.toml` is included; two environment variables connect
the halves:

```bash
# On Netlify — Site configuration → Environment variables. Read at BUILD time,
# so redeploy after changing it.
NEXT_PUBLIC_HUDDLE_SERVER=https://huddle.fly.dev

# On the backend (Fly/Railway/VPS/tunnel) — exact origin, no trailing slash.
HUDDLE_ALLOWED_ORIGINS=https://trademohuddle.netlify.app
```

With those set, the browser loads the page from Netlify and opens its socket, uploads and
downloads against the backend; the invite QR still points at the Netlify URL, because that
is where people should land. Without `HUDDLE_ALLOWED_ORIGINS` the backend refuses the
cross-origin request and the room never opens — that allowlist is never `*`, because the
upload endpoint trusts a session token sent in a header.

Verify a pair before handing the link out:

```bash
SMOKE_UI_ORIGIN=https://trademohuddle.netlify.app npm run smoke https://huddle.fly.dev
```

You still need the backend host. There is no arrangement in which Netlify alone runs this
app — that would mean replacing Socket.IO with a hosted pub/sub (Ably, Pusher, Supabase
Realtime), SQLite with a serverless database (Turso keeps the SQL, Neon means rewriting
it), and disk uploads with presigned uploads to object storage, since a function body caps
out around 6 MB. That is a different application with three new dependencies, and it gives
up the premise that your conversation never leaves your own machine.

Either way, remember that a publicly reachable Huddle is open to anyone who has a room
code, and any visitor can create rooms and upload up to 100 MB per file on your disk. On
a LAN that is fine; on the open internet, put it behind Cloudflare Access or a reverse
proxy with basic auth.

## Checking it works

```bash
npm run check                           # secure-context grep + typecheck
npm run smoke                           # end-to-end checks against a running server
npm run guest 8GNYS8UT Priya "hello"    # pretend to be a second device
```

One thing no script can check: **open the LAN address in a real browser before you
trust a change.** `localhost` is a secure context and the LAN IP is not, so a whole
class of breakage is invisible until you do.

`smoke` drives two real socket clients through create, join, case-insensitive codes,
chat, replies, reactions, receipts, upload, ranged download, path traversal, delete
permissions, lock, kick, token rejoin and rate limiting. `guest` is for eyeballing the
UI when you only have one machine.

## Worth knowing

- **It is plain HTTP on your LAN.** The room code is the only secret and it travels in
  the clear, so treat a huddle as private-ish, not confidential, and lock the room once
  everyone is in. Do not port-forward it to the internet as-is — see the hosting section.
- **Plain http is not a "secure context",** and browsers quietly remove APIs there.
  Everything on `localhost` is a secure context, so these break *only* on the address
  people actually use — which is why `npm run check` greps for them:
  - `crypto.randomUUID` is undefined → `clientId()` in `src/lib/id.ts` builds a v4 UUID
    from `crypto.getRandomValues`, which is not restricted.
  - `navigator.clipboard` is missing → `copyText()` falls back to `execCommand`.
  - the microphone is refused outright → the mic button says so and stops. This is the
    one feature you cannot have over plain http; put it behind a local https proxy such
    as [caddy](https://caddyserver.com), or deploy it (hosts give you https) if you want
    voice notes on phones.
- **Uploaded files are guarded by an unguessable id, not per-request auth.** A room
  member could pass a file link to someone outside the room.
- **History is kept in plain SQLite** at `data/huddle.db`. Delete the `data/` folder to
  wipe everything.
- Uploads are capped at 100 MB and history at the last 500 messages per room; both live
  in `src/lib/constants.ts`.

## Ideas if you keep going

End-to-end encryption between members, group voice/video with WebRTC (the signalling
layer is already here), pinned messages, message editing, mDNS so people can type
`huddle.local` instead of an IP, and a `--tls` flag that generates a local certificate
so voice notes work everywhere. If it ever needs to outgrow one machine, presence would
move to Redis (Socket.IO has an adapter for it), SQLite to Postgres, and uploads to
object storage — at which point serverless hosting becomes possible.
