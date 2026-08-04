import type { DefaultEventsMap, Server, Socket } from "socket.io";
import { z } from "zod";
import * as store from "./store.ts";
import { AppError } from "./store.ts";
import { MAX_MESSAGE_CHARS, MAX_NAME_CHARS, MAX_ROOM_NAME_CHARS, REACTION_EMOJIS } from "../src/lib/constants.ts";
import type { Ack, ClientToServerEvents, Member, ServerToClientEvents, SocketData } from "../src/lib/types.ts";

type HuddleServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;
type HuddleSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

/* -------------------------------- presence -------------------------------- */

/** room code -> member id -> number of live sockets for that member. */
const presence = new Map<string, Map<string, number>>();

function onlineIn(code: string): Set<string> {
  return new Set(presence.get(code)?.keys() ?? []);
}

function addPresence(code: string, memberId: string): void {
  const room = presence.get(code) ?? new Map<string, number>();
  room.set(memberId, (room.get(memberId) ?? 0) + 1);
  presence.set(code, room);
}

function dropPresence(code: string, memberId: string): void {
  const room = presence.get(code);
  if (!room) return;
  const next = (room.get(memberId) ?? 0) - 1;
  if (next > 0) room.set(memberId, next);
  else room.delete(memberId);
  if (room.size === 0) presence.delete(code);
}

/* --------------------------------- helpers -------------------------------- */

const attachmentSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  mime: z.string().max(255),
  kind: z.enum(["image", "video", "audio", "file"]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
});

const createSchema = z.object({
  roomName: z.string().max(MAX_ROOM_NAME_CHARS).default(""),
  displayName: z.string().min(1).max(MAX_NAME_CHARS),
  passkey: z.string().max(64).optional(),
});

const joinSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Codes are 6 digits"),
  displayName: z.string().max(MAX_NAME_CHARS).default(""),
  passkey: z.string().max(64).optional(),
  token: z.string().max(128).optional(),
});

const sendSchema = z.object({
  id: z.string().min(8).max(64),
  body: z.string().max(MAX_MESSAGE_CHARS).default(""),
  attachment: attachmentSchema.nullish(),
  replyToId: z.string().max(64).nullish(),
});

/** Runs a handler, converting user-facing errors into a failed ack. */
function reply<T>(ack: unknown, run: () => T): void {
  const send = typeof ack === "function" ? (ack as Ack<T>) : null;
  try {
    const data = run();
    send?.({ ok: true, data });
  } catch (error) {
    if (error instanceof AppError) {
      send?.({ ok: false, error: error.message });
      return;
    }
    console.error("[huddle] handler failed:", error);
    send?.({ ok: false, error: "Something went wrong on the server" });
  }
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(result.error.issues[0]?.message ?? "That request looked malformed");
  }
  return result.data;
}

/** A simple token bucket so one tab cannot flood the room. */
function makeLimiter(capacity: number, refillPerSecond: number) {
  let tokens = capacity;
  let last = Date.now();
  return (): boolean => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

/* --------------------------------- wiring --------------------------------- */

export function attachSocketServer(io: HuddleServer): void {
  const broadcastPresence = (code: string): void => {
    io.to(code).emit("presence", store.listMembers(code, onlineIn(code)));
  };

  io.on("connection", (socket: HuddleSocket) => {
    const allowMessage = makeLimiter(15, 5);
    const allowSmall = makeLimiter(40, 20);

    const session = (): { code: string; memberId: string } => {
      const { roomCode, memberId } = socket.data;
      if (!roomCode || !memberId) throw new AppError("Join a huddle first");
      return { code: roomCode, memberId };
    };

    const enter = (code: string, member: Member): void => {
      socket.data.roomCode = code;
      socket.data.memberId = member.id;
      void socket.join(code);
      addPresence(code, member.id);
    };

    socket.on("room:peek", (code, ack) =>
      reply(ack, () => {
        const peek = store.peekRoom(String(code ?? "").replace(/\D/g, ""));
        if (!peek) throw new AppError("No huddle with that code");
        return { ...peek, memberCount: onlineIn(peek.code).size || peek.memberCount };
      }),
    );

    socket.on("room:create", (input, ack) =>
      reply(ack, () => {
        const parsed = parse(createSchema, input);
        const { room, member, token } = store.createRoom(parsed);
        enter(room.code, member);
        broadcastPresence(room.code);
        return {
          room,
          me: { ...member, online: true },
          members: store.listMembers(room.code, onlineIn(room.code)),
          messages: store.history(room.code),
          token,
        };
      }),
    );

    socket.on("room:join", (input, ack) =>
      reply(ack, () => {
        const parsed = parse(joinSchema, input);
        const { room, member, token, notice } = store.joinRoom(parsed);
        enter(room.code, member);

        // First-time joiners announce themselves; refreshes stay quiet.
        if (notice) socket.to(room.code).emit("msg:new", notice);
        broadcastPresence(room.code);

        return {
          room,
          me: { ...member, online: true },
          members: store.listMembers(room.code, onlineIn(room.code)),
          messages: store.history(room.code),
          token,
        };
      }),
    );

    socket.on("msg:send", (input, ack) =>
      reply(ack, () => {
        const { code, memberId } = session();
        if (!allowMessage()) throw new AppError("Slow down a moment");
        const parsed = parse(sendSchema, input);
        const message = store.addMessage({
          id: parsed.id,
          code,
          authorId: memberId,
          body: parsed.body,
          attachment: parsed.attachment ?? null,
          replyToId: parsed.replyToId ?? null,
        });
        store.touchMember(memberId);
        socket.to(code).emit("msg:new", message);
        // The sender gets the canonical row through the ack.
        return message;
      }),
    );

    socket.on("msg:delete", (id, ack) =>
      reply(ack, () => {
        const { code, memberId } = session();
        if (!allowSmall()) throw new AppError("Slow down a moment");
        const message = store.deleteMessage(code, memberId, String(id));
        io.to(code).emit("msg:patch", { id: message.id, deleted: true, body: "" });
        return null;
      }),
    );

    socket.on("msg:react", (input) => {
      try {
        const { code, memberId } = session();
        if (!allowSmall()) return;
        const id = String(input?.id ?? "");
        const emoji = String(input?.emoji ?? "");
        if (!REACTION_EMOJIS.includes(emoji)) return;
        const reactions = store.toggleReaction(code, memberId, id, emoji);
        io.to(code).emit("msg:patch", { id, reactions });
      } catch {
        /* reactions are fire-and-forget */
      }
    });

    socket.on("msg:seen", (ids) => {
      try {
        const { code, memberId } = session();
        if (!Array.isArray(ids) || ids.length === 0 || !allowSmall()) return;
        const applied = store.markSeen(code, memberId, ids.map(String));
        if (applied.length) io.to(code).emit("msg:seen", { memberId, ids: applied });
      } catch {
        /* ignore */
      }
    });

    socket.on("typing", (isTyping) => {
      try {
        const { code, memberId } = session();
        if (!allowSmall()) return;
        const member = store.getMember(memberId);
        if (!member) return;
        socket.to(code).emit("typing", { memberId, name: member.name, isTyping: Boolean(isTyping) });
      } catch {
        /* ignore */
      }
    });

    socket.on("host:lock", (locked) => {
      try {
        const { code, memberId } = session();
        const room = store.getRoom(code);
        if (!room || room.hostId !== memberId) return;
        store.setLocked(code, Boolean(locked));
        io.to(code).emit("room:patch", { locked: Boolean(locked) });
        io.to(code).emit("msg:new", store.systemMessage(code, Boolean(locked) ? "The host locked this huddle" : "The host unlocked this huddle"));
      } catch {
        /* ignore */
      }
    });

    socket.on("host:kick", (memberId, ack) =>
      reply(ack, () => {
        const { code, memberId: actorId } = session();
        const { member: target, notice } = store.kickMember(code, actorId, String(memberId));
        io.to(code).emit("msg:new", notice);

        for (const [, other] of io.of("/").sockets) {
          const typed = other as HuddleSocket;
          if (typed.data.roomCode === code && typed.data.memberId === target.id) {
            typed.emit("kicked", "The host removed you from this huddle");
            dropPresence(code, target.id);
            typed.data.roomCode = undefined;
            typed.data.memberId = undefined;
            void typed.leave(code);
          }
        }
        broadcastPresence(code);
        return null;
      }),
    );

    socket.on("room:leave", () => {
      const { roomCode, memberId } = socket.data;
      if (!roomCode || !memberId) return;
      const member = store.getMember(memberId);
      dropPresence(roomCode, memberId);
      void socket.leave(roomCode);
      socket.data.roomCode = undefined;
      socket.data.memberId = undefined;
      if (member && !onlineIn(roomCode).has(member.id)) {
        io.to(roomCode).emit("msg:new", store.systemMessage(roomCode, `${member.name} left`));
      }
      broadcastPresence(roomCode);
    });

    socket.on("disconnect", () => {
      const { roomCode, memberId } = socket.data;
      if (!roomCode || !memberId) return;
      store.touchMember(memberId);
      dropPresence(roomCode, memberId);
      broadcastPresence(roomCode);
    });
  });
}
