"use client";

import { io, type Socket } from "socket.io-client";
import { SERVER_ORIGIN } from "./config";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

export type HuddleSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let instance: HuddleSocket | null = null;

/**
 * One socket per tab, reused across route changes so a create-then-navigate
 * flow keeps the same connection (and therefore the same room membership).
 */
export function getSocket(): HuddleSocket {
  if (!instance) {
    // No URL = same origin, same port as the page (see server/index.ts). A URL
    // points a statically hosted UI at a backend that can hold sockets open.
    instance = io(SERVER_ORIGIN || undefined, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
      timeout: 8000,
    });
  }
  return instance;
}

/** Promise wrapper around Socket.IO acknowledgements. */
export function ask<T>(socket: HuddleSocket, event: string, payload?: unknown, timeoutMs = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const done = (error: unknown, response: unknown) => {
      if (error) {
        reject(new Error("The server did not answer — check your connection"));
        return;
      }
      const result = response as { ok: boolean; data?: T; error?: string };
      if (!result?.ok) {
        reject(new Error(result?.error ?? "That did not work"));
        return;
      }
      resolve(result.data as T);
    };

    // Socket.IO's typed emit cannot express "callback with error-first timeout",
    // so the cast is contained here. It has to stay a method call — a detached
    // `emit` reference loses its receiver and throws inside the client.
    const target = socket.timeout(timeoutMs) as unknown as {
      emit: (name: string, arg: unknown, cb: (error: unknown, response: unknown) => void) => void;
    };
    target.emit(event, payload, done);
  });
}
