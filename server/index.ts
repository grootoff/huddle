import { createServer } from "node:http";
import { rm } from "node:fs/promises";
import path from "node:path";
import next from "next";
import { Server } from "socket.io";
import { UPLOAD_DIR } from "./db.ts";
import * as store from "./store.ts";
import { attachSocketServer } from "./socket.ts";
import { lanAddresses } from "./net.ts";
import { setBridge } from "../src/lib/bridge.ts";

const port = Number(process.env.PORT ?? 4000);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, hostname: "0.0.0.0", port, dir: process.cwd() });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  void handle(req, res);
});

// Big files over slow Wi-Fi shouldn't be cut off mid-upload.
server.requestTimeout = 0;
server.headersTimeout = 60_000;

const io = new Server(server, {
  // Media never travels over the socket — only JSON metadata does.
  maxHttpBufferSize: 256 * 1024,
  pingInterval: 20_000,
  pingTimeout: 20_000,
});

attachSocketServer(io);

// Let the HTTP upload/download routes reuse this process's single DB handle.
setBridge({
  uploadDir: UPLOAD_DIR,
  memberIdForToken: (code, token) => store.memberIdForToken(code, token),
  roomExists: (code) => Boolean(store.getRoom(code)),
});

// Housekeeping: forget rooms nobody has opened in two days, files included.
const DAY = 24 * 60 * 60 * 1000;
const janitor = setInterval(
  () => {
    try {
      for (const code of store.purgeStaleRooms(2 * DAY)) {
        void rm(path.join(UPLOAD_DIR, code), { recursive: true, force: true });
        console.log(`[huddle] purged idle room ${code}`);
      }
    } catch (error) {
      console.error("[huddle] purge failed:", error);
    }
  },
  30 * 60 * 1000,
);
janitor.unref();

server.listen(port, "0.0.0.0", () => {
  const urls = ["localhost", ...lanAddresses()].map((host) => `http://${host}:${port}`);
  const width = Math.max(...urls.map((u) => u.length)) + 4;
  const line = "─".repeat(width);
  console.log(`\n  ┌${line}┐`);
  console.log(`  │  Huddle${" ".repeat(width - 8)}│`);
  console.log(`  ├${line}┤`);
  urls.forEach((url, i) => {
    const label = i === 0 ? "  " : "  ";
    console.log(`  │${label}${url}${" ".repeat(width - url.length - 2)}│`);
  });
  console.log(`  └${line}┘`);
  console.log(`\n  Share a LAN address above with anyone on this Wi-Fi.\n`);
});

const shutdown = (signal: string): void => {
  console.log(`\n[huddle] ${signal} — closing`);
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
