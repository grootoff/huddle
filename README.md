# Huddle

A private, WhatsApp-style chat room for everyone on the same Wi-Fi. One person runs
it, shares an 8-character code like `8GNY S8UT` (or a QR), and anyone on the network
joins from a browser with just their name. No accounts, no cloud — messages and files
never leave the machine that hosts it.

```bash
npm install
npm run dev          # http://localhost:4000 + your LAN address, printed on boot
```

Hand out the LAN address it prints (e.g. `http://192.168.1.24:4000`). Everyone lands
on the same page: **Start one** creates a room, **Join a huddle** enters a code.

For real use, build once and run in production mode:

```bash
npm run build
npm start            # PORT=4000 by default
```

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

## Hosting it somewhere other than your laptop

**Netlify and Vercel cannot run this**, and no config file will change that. Huddle is a
single long-lived process that holds open WebSocket connections, keeps presence in
memory, and writes SQLite plus uploaded files to a disk. Those platforms run stateless
serverless functions: `server/index.ts` never boots, Functions do not accept WebSocket
upgrades, and the filesystem is thrown away between invocations. The symptom is exactly
what you would expect — the page loads and "create room" hangs, because the socket never
connects.

What works is anything that runs a container with a volume. A `Dockerfile` and a
`fly.toml` are included:

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

Either way, remember that a publicly reachable Huddle is open to anyone who has a room
code, and any visitor can create rooms and upload up to 100 MB per file on your disk. On
a LAN that is fine; on the open internet, put it behind Cloudflare Access or a reverse
proxy with basic auth.

## Checking it works

```bash
npm run smoke                           # end-to-end checks against a running server
npm run guest 8GNYS8UT Priya "hello"    # pretend to be a second device
```

`smoke` drives two real socket clients through create, join, case-insensitive codes,
chat, replies, reactions, receipts, upload, ranged download, path traversal, delete
permissions, lock, kick, token rejoin and rate limiting. `guest` is for eyeballing the
UI when you only have one machine.

## Worth knowing

- **It is plain HTTP on your LAN.** The room code is the only secret and it travels in
  the clear, so treat a huddle as private-ish, not confidential, and lock the room once
  everyone is in. Do not port-forward it to the internet as-is — see the hosting section.
- **Voice notes need a secure context.** Browsers only grant microphone access over
  https or on `localhost`, so on `http://192.168.…` the mic button explains itself and
  stops. Everything else (including file upload) works fine. Put it behind a local
  https proxy such as [caddy](https://caddyserver.com) if you want voice notes on phones.
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
