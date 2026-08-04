# Huddle

A private, WhatsApp-style chat room for everyone on the same Wi-Fi. One person runs it,
shares an 8-character code like `8GNY S8UT` (or a QR), and anyone on the network joins
from a browser with just their name.

**This runs on your own machine, on your own network, and nowhere else.** Messages and
files are written to a folder next to the app; nothing is uploaded, no account exists, no
service is called. That is the entire point, and it is also the design constraint: there
is no cloud mode, and hosting it on the public internet is out of scope.

```bash
npm install
npm run build
npm start            # http://localhost:4000 + your LAN address, printed on boot
```

Hand out the LAN address it prints (e.g. `http://192.168.1.24:4000`). Everyone lands on
the same page: **Start one** creates a room, **Join a huddle** enters a code.

Needs **Node 24** — the server runs TypeScript directly and uses the built-in
`node:sqlite`, so there is nothing to compile and no native module to install.
`npm start` checks the version and tells you if it is too old.

`npm run dev` exists for working on the code. Use `npm start` when other people are
actually joining: dev mode ships an unminified bundle plus hot-reload to every phone on
the network.

## What it does

**Rooms** — one 8-character code that is both the room's address and its only secret
(33⁸ ≈ 1.4 × 10¹² possibilities from a CSPRNG). `I`, `L` and `O` are left out of the
alphabet because they are indistinguishable from `1` and `0` on a phone screen, and typing
them is folded automatically, so `8gnys8ut`, `8GNYS8UT` and `8GNY S8UT` all open the same
room. Treat the code like a password: anyone on the network who has it can walk in. The
host can lock the room once everyone has arrived, and remove people.

**Joining** — nobody is anonymous: the name prompt comes before the room. The server
issues a session token the browser keeps, so a refresh, or a phone locking itself, drops
you back in as the same person with the same history.

**Chat** — live messages, typing indicators, presence, replies with quoted previews,
emoji reactions, delete-for-everyone (with a confirm step, and it deletes the file too),
read receipts (✓ sent, ✓✓ read, lighter ✓✓ once everyone has read), day separators,
message grouping, link detection, an unread pill, a tab badge and a soft chime when the
tab is in the background.

**Files** — drag anywhere, paste from the clipboard, or use the paperclip. **100 MB per
file, 1 GB per room**, streamed straight to disk with real upload progress. Images and
videos preview inline (tap an image for a lightbox), audio gets a compact player, anything
else becomes a download card. Video and audio serve range requests, so seeking works.

**Voice notes** — tap the mic, tap again to send. Only works on `localhost`; see
"Plain http" below.

**Invite panel** — the room code in large type, a copyable link, and a QR code pointing at
the LAN address this browser is actually using, so a phone camera joins in one scan.

Dark and light themes. Laid out for phones first: the composer stays above the keyboard,
and tapping a bubble reveals its actions.

## How it is put together

One Node process serves everything on one port. That matters: a single URL is all you can
realistically read out loud or put on a QR code.

| Piece | Choice |
| --- | --- |
| UI | Next.js 16 (App Router), React 19, Tailwind v4 |
| Realtime | Socket.IO 4, attached to the same HTTP server (`server/index.ts`) |
| Storage | `node:sqlite`, WAL mode — built into Node, no native module |
| Uploads | `PUT /api/upload`, raw body plus metadata headers, streamed to disk |
| TypeScript | run directly by Node's type stripping — no tsx, no build step for the server |

```
server/            the long-lived process
  index.ts         boot, LAN banner, idle-room janitor, graceful shutdown
  socket.ts        every realtime event, validated with zod and rate limited
  store.ts         all SQL and room rules — the only module that touches the db
  ids.ts           room codes, session tokens, avatar colours
  net.ts           finds this machine's LAN addresses
src/
  app/             pages, plus three routes: upload, file download, net/QR
  components/      chat UI
  hooks/useRoom.ts room state, optimistic sends, reconnect handling
  lib/             shared types and constants, formatting, upload client
data/              created on first run: huddle.db + uploads/<room code>/
```

Route handlers are bundled by Next and so live in a different module graph from the socket
server. They reach the process's single SQLite handle through a small `globalThis` bridge
(`src/lib/bridge.ts`) rather than opening a second connection.

Rooms nobody has opened for two days are dropped automatically, uploads included.

## If it will not start

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Unknown file extension ".ts"` | Node older than 23.6 | `nvm install 24 && nvm use 24` |
| `Another next dev server is already running` | stale lock in `.next/dev`, or one really is | `rm -rf .next/dev`, or stop the other process |
| `Port 4000 is already in use` | something else has the port | `lsof -nP -iTCP:4000 -sTCP:LISTEN`, or `PORT=4001 npm start` |
| Loads on another device but never becomes interactive | dev mode blocks its assets from unknown origins | use `npm start`; in dev this is handled by `allowedDevOrigins` in `next.config.ts`, which needs a restart after changing networks |
| Styles vanish after a rebuild | `npm run build` ran while `npm start` was serving; the old stylesheet is gone | restart the server after every build |

Phones cannot reach it at all? Check the machine's firewall (macOS: System Settings →
Network → Firewall), and that both devices are on the same subnet — guest Wi-Fi usually
isolates clients from each other.

## Checking a change

```bash
npm run check                            # secure-context scan + typecheck
npm run smoke                            # end-to-end, needs a server running
npm run guest 8GNYS8UT Priya "hello"     # pretend to be a second device
SMOKE_LIMITS=1 npm run smoke             # also test the size caps (slow, ~1 GB of disk)
```

`smoke` drives two real socket clients through create, join, case-insensitive codes, chat,
replies, reactions, receipts, upload, ranged download, path traversal, delete permissions,
lock, kick, token rejoin and rate limiting. `guest` is for eyeballing the UI when you only
have one machine.

One thing no script can check: **open the LAN address in a real browser before trusting a
change.** `localhost` is a secure context and `192.168.x.x` is not, so a whole class of
breakage is invisible until you do.

## Worth knowing

- **Plain http on a LAN is not a "secure context",** and browsers silently remove APIs
  there. Everything works on `localhost`, so these break *only* at the address people
  actually use — which is why `npm run check` greps for them:
  - `crypto.randomUUID` is undefined → `clientId()` in `src/lib/id.ts` builds a v4 UUID
    from `crypto.getRandomValues`, which is not restricted.
  - `navigator.clipboard` is missing → `copyText()` falls back to `execCommand`.
  - the microphone is refused outright → the mic button explains itself and stops. This is
    the one feature plain http cannot have. Put the app behind a local https proxy such as
    [caddy](https://caddyserver.com) if you need voice notes on phones.
- **The room code travels in the clear.** Treat a huddle as private-ish, not confidential.
  Lock the room once everyone is in.
- **Uploaded files are guarded by an unguessable id, not per-request auth.** Anyone in the
  room can pass a file link to someone outside it.
- **Upload limits are enforced three ways** and are not configurable: a `Content-Length`
  check, a meter on the byte stream (so omitting or lying about the length gains nothing),
  and a per-room disk total checked before and during the write. Both numbers live in
  `src/lib/constants.ts`; there is no env var, because an env-configurable version had to
  exist in two places — inlined into the browser bundle at build time, read by the server
  at runtime — and the two silently disagreed.
- **History is plain SQLite** at `data/huddle.db`, capped at the last 500 messages per
  room. Delete the `data/` folder to wipe everything.
- **Do not port-forward this to the internet.** There is no account system; the room code
  is the only thing between a stranger and the chat, and any visitor can upload to your
  disk. If you want it reachable from outside your network, put it behind something that
  authenticates first — and re-read the two bullets above before deciding to.

A `Dockerfile` is included for running it on an always-on machine on your own network — a
home server, a NAS, a Pi — rather than a laptop. Mount a volume at `/data`, and run one
instance only: presence lives in memory and the database is a local file, so a second
replica would see a different set of rooms.

## Ideas if you keep going

End-to-end encryption between members, group voice/video over WebRTC (the signalling layer
is already here), pinned messages, message editing, mDNS so people can type `huddle.local`
instead of an IP, and a `--tls` flag that mints a local certificate so voice notes work on
phones too.

## License

[MIT](LICENSE) — do what you like with it, no warranty.
