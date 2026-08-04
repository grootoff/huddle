/**
 * End-to-end smoke test against a running server (npm run dev in another shell).
 *
 *   node scripts/smoke.mjs [http://localhost:4000]
 *
 * Drives two real socket clients through the whole flow: create, join, chat,
 * reactions, receipts, a raw-body upload, ranged download, lock and kick.
 * Exits non-zero on the first failure.
 */
import assert from "node:assert/strict";
import { io } from "socket.io-client";

const ORIGIN = process.argv[2] ?? "http://localhost:4000";
/**
 * Set to the origin of a separately hosted UI to also exercise the split
 * deployment path, e.g.
 *   SMOKE_UI_ORIGIN=https://trademohuddle.netlify.app npm run smoke
 * The server must have been started with the same value in HUDDLE_ALLOWED_ORIGINS.
 */
const UI_ORIGIN = process.env.SMOKE_UI_ORIGIN ?? "";

let passed = 0;
const check = (label, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
};

const connect = () =>
  new Promise((resolve, reject) => {
    const socket = io(ORIGIN, { transports: ["websocket"], timeout: 8000 });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });

const ask = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (timeout, response) => {
      if (timeout) return reject(new Error(`${event}: no response`));
      if (!response?.ok) return reject(new Error(`${event}: ${response?.error}`));
      resolve(response.data);
    });
  });

const expectFailure = async (promise, expected) => {
  try {
    await promise;
    throw new Error(`expected failure containing "${expected}"`);
  } catch (error) {
    assert.match(error.message, new RegExp(expected, "i"));
  }
};

/** Resolves with the next payload for `event`, or rejects after `ms`. */
const nextEvent = (socket, event, ms = 6000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timed out waiting for ${event}`));
    }, ms);
    const onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };
    socket.on(event, onEvent);
  });

const run = async () => {
  console.log(`\nHuddle smoke test → ${ORIGIN}\n`);

  const host = await connect();
  const guest = await connect();

  /* ---------------------------- create and join --------------------------- */

  const created = await ask(host, "room:create", {
    displayName: "Hosty",
    roomName: "Smoke Room",
  });
  const code = created.room.code;
  check("host creates a room with an 8-character code", () => {
    assert.match(code, /^[A-HJ-KM-NP-Z0-9]{8}$/);
    assert.equal(created.me.isHost, true);
    assert.ok(created.token);
  });

  const peek = await ask(guest, "room:peek", code);
  check("peek describes the room without joining", () => {
    assert.equal(peek.name, "Smoke Room");
    assert.equal(peek.locked, false);
  });

  const lowered = await ask(guest, "room:peek", code.toLowerCase());
  check("codes are case-insensitive", () => assert.equal(lowered.code, code));

  await expectFailure(ask(guest, "room:join", { code: "ZZZZZZZZ", displayName: "Guest" }), "no huddle");
  await expectFailure(ask(guest, "room:join", { code: "SHORT", displayName: "Guest" }), "8 characters");
  check("an unknown or malformed code is rejected", () => {});

  const hostSawJoin = nextEvent(host, "msg:new");
  const joined = await ask(guest, "room:join", { code, displayName: "Guesty" });
  check("guest joins with the code", () => {
    assert.equal(joined.me.name, "Guesty");
    assert.equal(joined.me.isHost, false);
    assert.equal(joined.members.length, 2);
    assert.ok(joined.messages.length >= 1);
  });
  check("host is told about the arrival", async () => {
    assert.ok(hostSawJoin);
  });
  const joinNotice = await hostSawJoin;
  check("arrival is a system message", () => {
    assert.equal(joinNotice.kind, "system");
    assert.match(joinNotice.body, /Guesty joined/);
  });

  /* -------------------------------- messages ------------------------------ */

  const guestGetsText = nextEvent(guest, "msg:new");
  const sent = await ask(host, "msg:send", { id: crypto.randomUUID(), body: "hello over wifi" });
  const received = await guestGetsText;
  check("text messages arrive with author details", () => {
    assert.equal(received.id, sent.id);
    assert.equal(received.body, "hello over wifi");
    assert.equal(received.authorName, "Hosty");
    assert.ok(received.authorColor.startsWith("#"));
  });

  const guestGetsReply = nextEvent(guest, "msg:new");
  await ask(host, "msg:send", { id: crypto.randomUUID(), body: "and a reply", replyToId: sent.id });
  const reply = await guestGetsReply;
  check("replies carry a quoted preview", () => {
    assert.equal(reply.replyTo?.id, sent.id);
    assert.equal(reply.replyTo?.preview, "hello over wifi");
  });

  const hostGetsReaction = nextEvent(host, "msg:patch");
  guest.emit("msg:react", { id: sent.id, emoji: "👍" });
  const reacted = await hostGetsReaction;
  check("reactions broadcast to the room", () => {
    assert.deepEqual(Object.keys(reacted.reactions ?? {}), ["👍"]);
    assert.equal(reacted.reactions["👍"].length, 1);
  });

  const hostGetsUnreact = nextEvent(host, "msg:patch");
  guest.emit("msg:react", { id: sent.id, emoji: "👍" });
  const unreacted = await hostGetsUnreact;
  check("reacting again removes the reaction", () => {
    assert.equal((unreacted.reactions?.["👍"] ?? []).length, 0);
  });

  const hostGetsSeen = nextEvent(host, "msg:seen");
  guest.emit("msg:seen", [sent.id]);
  const seen = await hostGetsSeen;
  check("read receipts reach the author", () => {
    assert.deepEqual(seen.ids, [sent.id]);
    assert.equal(seen.memberId, joined.me.id);
  });

  const guestSeesTyping = nextEvent(guest, "typing");
  host.emit("typing", true);
  const typing = await guestSeesTyping;
  check("typing indicators propagate", () => {
    assert.equal(typing.isTyping, true);
    assert.equal(typing.name, "Hosty");
  });

  /* --------------------------------- uploads ------------------------------ */

  const bytes = Buffer.alloc(64 * 1024, 7);
  const uploadResponse = await fetch(`${ORIGIN}/api/upload`, {
    method: "PUT",
    headers: {
      "content-type": "application/pdf",
      "x-huddle-room": code,
      "x-huddle-token": joined.token,
      "x-huddle-name": encodeURIComponent("quarterly report.pdf"),
    },
    body: bytes,
  });
  const attachment = await uploadResponse.json();
  check("upload stores the file and returns metadata", () => {
    assert.equal(uploadResponse.status, 201);
    assert.equal(attachment.size, bytes.length);
    assert.equal(attachment.kind, "file");
    assert.equal(attachment.name, "quarterly report.pdf");
  });

  const anonUpload = await fetch(`${ORIGIN}/api/upload`, {
    method: "PUT",
    headers: { "x-huddle-room": code, "x-huddle-token": "not-a-token", "x-huddle-name": "x.txt" },
    body: Buffer.from("nope"),
  });
  check("upload without a valid token is refused", () => assert.equal(anonUpload.status, 401));

  const hostGetsFile = nextEvent(host, "msg:new");
  await ask(guest, "msg:send", { id: crypto.randomUUID(), body: "", attachment });
  const fileMessage = await hostGetsFile;
  check("file messages broadcast with their attachment", () => {
    assert.equal(fileMessage.attachment?.id, attachment.id);
    assert.equal(fileMessage.kind, "file");
  });

  const download = await fetch(`${ORIGIN}/api/files/${code}/${attachment.id}`);
  const downloaded = Buffer.from(await download.arrayBuffer());
  check("download returns the exact bytes", () => {
    assert.equal(download.status, 200);
    assert.equal(downloaded.length, bytes.length);
    assert.ok(downloaded.equals(bytes));
    assert.equal(download.headers.get("accept-ranges"), "bytes");
    assert.match(download.headers.get("content-disposition") ?? "", /attachment/);
  });

  const ranged = await fetch(`${ORIGIN}/api/files/${code}/${attachment.id}`, {
    headers: { range: "bytes=10-19" },
  });
  const rangedBody = Buffer.from(await ranged.arrayBuffer());
  check("range requests return a partial body", () => {
    assert.equal(ranged.status, 206);
    assert.equal(rangedBody.length, 10);
    assert.equal(ranged.headers.get("content-range"), `bytes 10-19/${bytes.length}`);
  });

  const missing = await fetch(`${ORIGIN}/api/files/${code}/../../package.json`);
  check("path traversal in a file id is refused", () => assert.ok(missing.status === 404 || missing.status === 400));

  /* ----------------------- split deployment (optional) --------------------- */

  if (UI_ORIGIN) {
    const allowed = await fetch(`${ORIGIN}/api/upload`, {
      method: "OPTIONS",
      headers: { origin: UI_ORIGIN, "access-control-request-method": "PUT" },
    });
    check("preflight allows the configured UI origin", () => {
      assert.equal(allowed.status, 204);
      assert.equal(allowed.headers.get("access-control-allow-origin"), UI_ORIGIN);
      assert.match(allowed.headers.get("access-control-allow-headers") ?? "", /x-huddle-token/);
    });

    const refused = await fetch(`${ORIGIN}/api/upload`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "PUT" },
    });
    check("preflight refuses every other origin", () => assert.equal(refused.status, 403));

    const crossUpload = await fetch(`${ORIGIN}/api/upload`, {
      method: "PUT",
      headers: {
        origin: UI_ORIGIN,
        "content-type": "text/plain",
        "x-huddle-room": code,
        "x-huddle-token": joined.token,
        "x-huddle-name": "cross-origin.txt",
      },
      body: Buffer.from("hosted UI, remote backend"),
    });
    const crossAttachment = await crossUpload.json();
    check("cross-origin upload works and echoes the origin", () => {
      assert.equal(crossUpload.status, 201);
      assert.equal(crossUpload.headers.get("access-control-allow-origin"), UI_ORIGIN);
      assert.equal(crossAttachment.name, "cross-origin.txt");
    });

    const qr = await fetch(`${ORIGIN}/api/net?code=${code}&origin=${encodeURIComponent(UI_ORIGIN)}`, {
      headers: { origin: UI_ORIGIN },
    });
    const net = await qr.json();
    check("invite link points at the hosted UI, not the backend", () => {
      assert.equal(net.joinUrl, `${UI_ORIGIN}/r/${code}`);
      assert.ok(net.qr.startsWith("data:image/png;base64,"));
    });

    const spoofed = await fetch(`${ORIGIN}/api/net?code=${code}&origin=javascript:alert(1)`);
    const spoofedNet = await spoofed.json();
    check("a non-http advertised origin is ignored", () =>
      assert.ok(!spoofedNet.joinUrl.startsWith("javascript:")),
    );
  }

  /* ------------------------------- moderation ----------------------------- */

  const hostDeletes = nextEvent(host, "msg:patch");
  await ask(guest, "msg:delete", fileMessage.id);
  const deleted = await hostDeletes;
  check("authors can delete their own messages", () => {
    assert.equal(deleted.deleted, true);
  });

  await expectFailure(ask(guest, "msg:delete", sent.id), "only delete your own");
  check("a non-host cannot delete someone else's message", () => {});

  await expectFailure(ask(guest, "host:kick", created.me.id), "only the host");
  check("a non-host cannot remove people", () => {});

  const lockNotice = nextEvent(guest, "room:patch");
  host.emit("host:lock", true);
  check("host can lock the room", async () => assert.equal((await lockNotice).locked, true));
  await lockNotice;

  const stranger = await connect();
  await expectFailure(ask(stranger, "room:join", { code, displayName: "Late" }), "locked");
  check("locked rooms turn away new people", () => {});
  stranger.close();

  host.emit("host:lock", false);
  await new Promise((resolve) => setTimeout(resolve, 150));

  /* --------------------------- refresh and removal ------------------------ */

  const rejoin = await ask(guest, "room:join", { code, displayName: "Guesty", token: joined.token });
  check("a token rejoin keeps the same identity and history", () => {
    assert.equal(rejoin.me.id, joined.me.id);
    assert.ok(rejoin.messages.length >= 4);
  });

  const kickedNotice = nextEvent(guest, "kicked");
  await ask(host, "host:kick", joined.me.id);
  check("host removes the guest", async () => assert.match(await kickedNotice, /removed/i));
  await kickedNotice;

  await expectFailure(
    ask(guest, "room:join", { code, displayName: "Guesty", token: joined.token }),
    "were removed",
  );
  check("a removed member cannot walk back in with their token", () => {});

  const rateLimited = await (async () => {
    const flood = [];
    for (let i = 0; i < 40; i += 1) {
      flood.push(ask(host, "msg:send", { id: crypto.randomUUID(), body: `flood ${i}` }).catch((e) => e.message));
    }
    return (await Promise.all(flood)).some((r) => typeof r === "string" && /slow down/i.test(r));
  })();
  check("flooding is rate limited", () => assert.equal(rateLimited, true));

  host.close();
  guest.close();
  console.log(`\n${passed} checks passed\n`);
};

run().then(
  () => process.exit(0),
  (error) => {
    console.error(`\nFAILED: ${error.message}\n`);
    process.exit(1);
  },
);
