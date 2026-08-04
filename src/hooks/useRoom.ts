"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ask, getSocket, type HuddleSocket } from "@/lib/socket";
import { clearRoom, loadName, loadRoom, saveRoom } from "@/lib/session";
import { probeMedia, uploadFile } from "@/lib/upload";
import { TYPING_TTL_MS } from "@/lib/constants";
import type { Attachment, Member, Message, RoomInfo, RoomPeek, RoomState } from "@/lib/types";

export type Phase = "connecting" | "gate" | "joining" | "joined" | "denied";

/** A message plus purely local delivery state. */
export interface ChatMessage extends Message {
  status?: "sending" | "failed";
  /** Object URL shown while the attachment is still uploading. */
  localUrl?: string;
  /** 0–1 upload progress for optimistic file bubbles. */
  progress?: number;
}

interface Typer {
  id: string;
  name: string;
  at: number;
}

export interface RoomApi {
  phase: Phase;
  connected: boolean;
  error: string | null;
  peek: RoomPeek | null;
  room: RoomInfo | null;
  me: Member | null;
  members: Member[];
  messages: ChatMessage[];
  typers: Typer[];
  join: (input: { displayName: string; passkey?: string }) => Promise<void>;
  send: (input: { body: string; replyToId?: string | null }) => void;
  sendFiles: (files: File[], replyToId?: string | null) => void;
  sendVoice: (blob: Blob, durationSeconds: number) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  react: (id: string, emoji: string) => void;
  reportTyping: (isTyping: boolean) => void;
  markSeen: () => void;
  kick: (memberId: string) => Promise<void>;
  setLocked: (locked: boolean) => void;
  leave: () => void;
  dismissError: () => void;
}

export function useRoom(code: string): RoomApi {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState<RoomPeek | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typers, setTypers] = useState<Typer[]>([]);

  const socketRef = useRef<HuddleSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const meRef = useRef<Member | null>(null);
  const phaseRef = useRef<Phase>("connecting");
  /** Blobs kept around so a failed file send can be retried. */
  const blobsRef = useRef(new Map<string, { blob: Blob; name: string; replyToId: string | null }>());
  /** Mirror of `messages` for callbacks that must not re-create on every keystroke. */
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const setPhaseSafe = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const applyState = useCallback((state: RoomState) => {
    tokenRef.current = state.token;
    meRef.current = state.me;
    setRoom(state.room);
    setMe(state.me);
    setMembers(state.members);
    // Keep bubbles that are still in flight; the server has not seen them yet.
    setMessages((current) => {
      const known = new Set(state.messages.map((m) => m.id));
      const inFlight = current.filter((m) => m.status && !known.has(m.id));
      return [...state.messages, ...inFlight];
    });
    saveRoom(state.room.code, {
      token: state.token,
      name: state.me.name,
      memberId: state.me.id,
      roomName: state.room.name,
    });
  }, []);

  /* ------------------------------ connection ------------------------------ */

  const attemptJoin = useCallback(
    async (input: { displayName: string; passkey?: string; token?: string }, silent: boolean): Promise<void> => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!silent) setPhaseSafe("joining");
      try {
        const state = await ask<RoomState>(socket, "room:join", { code, ...input });
        applyState(state);
        setError(null);
        setPhaseSafe("joined");
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not join";
        if (silent) {
          // A stale token (purged room, or removed by the host) — ask again.
          clearRoom(code);
          tokenRef.current = null;
          setError(message);
          setPhaseSafe("gate");
        } else {
          setError(message);
          setPhaseSafe("gate");
        }
      }
    },
    [applyState, code, setPhaseSafe],
  );

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const bootstrap = async () => {
      try {
        setPeek(await ask<RoomPeek>(socket, "room:peek", code));
      } catch (cause) {
        setPeek(null);
        setError(cause instanceof Error ? cause.message : "No huddle with that code");
        setPhaseSafe("denied");
        return;
      }
      const stored = loadRoom(code);
      if (stored?.token) {
        tokenRef.current = stored.token;
        await attemptJoin({ displayName: stored.name, token: stored.token }, true);
      } else if (phaseRef.current === "connecting") {
        setPhaseSafe("gate");
      }
    };

    const onConnect = () => {
      setConnected(true);
      // A reconnect gets a brand new server-side socket, so re-enter the room.
      if (phaseRef.current === "joined" && tokenRef.current) {
        void attemptJoin({ displayName: meRef.current?.name ?? loadName(), token: tokenRef.current }, true);
      } else if (phaseRef.current === "connecting") {
        void bootstrap();
      }
    };

    const onDisconnect = () => setConnected(false);

    const onMessage = (message: Message) =>
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));

    const onPatch = (patch: { id: string; reactions?: Record<string, string[]>; deleted?: boolean; body?: string }) =>
      setMessages((current) =>
        current.map((m) =>
          m.id === patch.id
            ? {
                ...m,
                reactions: patch.reactions ?? m.reactions,
                deleted: patch.deleted ?? m.deleted,
                body: patch.deleted ? "" : (patch.body ?? m.body),
                attachment: patch.deleted ? null : m.attachment,
              }
            : m,
        ),
      );

    const onSeen = (patch: { memberId: string; ids: string[] }) => {
      const ids = new Set(patch.ids);
      setMessages((current) =>
        current.map((m) =>
          ids.has(m.id) && !m.seenBy.includes(patch.memberId) ? { ...m, seenBy: [...m.seenBy, patch.memberId] } : m,
        ),
      );
    };

    const onPresence = (next: Member[]) => {
      setMembers(next);
      const mine = meRef.current;
      if (mine) {
        const updated = next.find((m) => m.id === mine.id);
        if (updated) {
          meRef.current = updated;
          setMe(updated);
        }
      }
    };

    const onTyping = (patch: { memberId: string; name: string; isTyping: boolean }) =>
      setTypers((current) => {
        const rest = current.filter((t) => t.id !== patch.memberId);
        return patch.isTyping ? [...rest, { id: patch.memberId, name: patch.name, at: Date.now() }] : rest;
      });

    const onRoomPatch = (patch: Partial<Pick<RoomInfo, "locked" | "name">>) =>
      setRoom((current) => (current ? { ...current, ...patch } : current));

    const onKicked = (reason: string) => {
      clearRoom(code);
      tokenRef.current = null;
      setError(reason);
      setPhaseSafe("denied");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("msg:new", onMessage);
    socket.on("msg:patch", onPatch);
    socket.on("msg:seen", onSeen);
    socket.on("presence", onPresence);
    socket.on("typing", onTyping);
    socket.on("room:patch", onRoomPatch);
    socket.on("kicked", onKicked);

    if (socket.connected) {
      setConnected(true);
      void bootstrap();
    } else if (socket.disconnected) {
      socket.connect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("msg:new", onMessage);
      socket.off("msg:patch", onPatch);
      socket.off("msg:seen", onSeen);
      socket.off("presence", onPresence);
      socket.off("typing", onTyping);
      socket.off("room:patch", onRoomPatch);
      socket.off("kicked", onKicked);
    };
  }, [attemptJoin, code, setPhaseSafe]);

  // Typing indicators expire on their own if a "stopped" event goes missing.
  useEffect(() => {
    if (typers.length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL_MS;
      setTypers((current) => {
        const next = current.filter((t) => t.at > cutoff);
        return next.length === current.length ? current : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typers.length]);

  /* -------------------------------- actions ------------------------------- */

  const join = useCallback(
    async (input: { displayName: string; passkey?: string }) => {
      await attemptJoin(input, false);
    },
    [attemptJoin],
  );

  /** Builds the local bubble that appears before the server confirms. */
  const optimistic = useCallback(
    (id: string, body: string, replyToId: string | null, attachment: Attachment | null, localUrl?: string): ChatMessage => {
      const mine = meRef.current;
      const replied = replyToId ? messagesRef.current.find((m) => m.id === replyToId) : null;
      return {
        id,
        seq: Number.MAX_SAFE_INTEGER,
        kind: attachment ? "file" : "text",
        authorId: mine?.id ?? null,
        authorName: mine?.name ?? "You",
        authorColor: mine?.color ?? "#0d9488",
        body,
        attachment,
        replyTo: replied
          ? {
              id: replied.id,
              authorName: replied.authorName,
              preview: replied.attachment ? replied.attachment.name : replied.body.slice(0, 140),
            }
          : null,
        createdAt: Date.now(),
        editedAt: null,
        deleted: false,
        reactions: {},
        seenBy: [],
        status: "sending",
        localUrl,
        progress: attachment ? 0 : undefined,
      };
    },
    [],
  );

  const patchLocal = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const commit = useCallback(
    async (draft: ChatMessage, payload: { attachment?: Attachment | null }) => {
      const socket = socketRef.current;
      if (!socket) return;
      try {
        const saved = await ask<Message>(socket, "msg:send", {
          id: draft.id,
          body: draft.body,
          attachment: payload.attachment ?? null,
          replyToId: draft.replyTo?.id ?? null,
        });
        setMessages((current) => current.map((m) => (m.id === saved.id ? { ...saved } : m)));
        blobsRef.current.delete(draft.id);
      } catch (cause) {
        patchLocal(draft.id, { status: "failed" });
        setError(cause instanceof Error ? cause.message : "Message not sent");
      }
    },
    [patchLocal],
  );

  const send = useCallback(
    ({ body, replyToId }: { body: string; replyToId?: string | null }) => {
      const text = body.trim();
      if (!text) return;
      const draft = optimistic(crypto.randomUUID(), text, replyToId ?? null, null);
      setMessages((current) => [...current, draft]);
      void commit(draft, {});
    },
    [commit, optimistic],
  );

  const uploadAndSend = useCallback(
    async (blob: Blob, name: string, replyToId: string | null, knownMeta?: { duration?: number }) => {
      const roomCode = code;
      const token = tokenRef.current;
      if (!token) return;

      const meta = { ...(await probeMedia(blob)), ...knownMeta };
      const localUrl = URL.createObjectURL(blob);
      const id = crypto.randomUUID();
      const placeholder: Attachment = {
        id: "pending",
        name,
        size: blob.size,
        mime: blob.type || "application/octet-stream",
        kind: blob.type.startsWith("image/")
          ? "image"
          : blob.type.startsWith("video/")
            ? "video"
            : blob.type.startsWith("audio/")
              ? "audio"
              : "file",
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
      };

      const draft = optimistic(id, "", replyToId, placeholder, localUrl);
      blobsRef.current.set(id, { blob, name, replyToId });
      setMessages((current) => [...current, draft]);

      try {
        const attachment = await uploadFile({
          blob,
          name,
          roomCode,
          token,
          meta,
          onProgress: (fraction) => patchLocal(id, { progress: fraction }),
        }).done;
        await commit({ ...draft, attachment }, { attachment });
      } catch (cause) {
        patchLocal(id, { status: "failed", progress: undefined });
        setError(cause instanceof Error ? cause.message : "Upload failed");
      }
    },
    [code, commit, optimistic, patchLocal],
  );

  const sendFiles = useCallback(
    (files: File[], replyToId?: string | null) => {
      files.forEach((file, index) => {
        // Stagger slightly so progress bars don't all fight for bandwidth at once.
        setTimeout(() => void uploadAndSend(file, file.name, replyToId ?? null), index * 120);
      });
    },
    [uploadAndSend],
  );

  const sendVoice = useCallback(
    (blob: Blob, durationSeconds: number) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      void uploadAndSend(blob, `voice-${stamp}.webm`, null, { duration: durationSeconds });
    },
    [uploadAndSend],
  );

  const retry = useCallback(
    (id: string) => {
      const target = messagesRef.current.find((m) => m.id === id);
      if (!target) return;
      const pendingBlob = blobsRef.current.get(id);
      setMessages((current) => current.filter((m) => m.id !== id));
      if (pendingBlob) {
        void uploadAndSend(pendingBlob.blob, pendingBlob.name, pendingBlob.replyToId);
      } else {
        send({ body: target.body, replyToId: target.replyTo?.id ?? null });
      }
    },
    [send, uploadAndSend],
  );

  const remove = useCallback(async (id: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    const target = messagesRef.current.find((m) => m.id === id);
    if (target?.status) {
      // Never reached the server — just drop it locally.
      setMessages((current) => current.filter((m) => m.id !== id));
      blobsRef.current.delete(id);
      return;
    }
    try {
      await ask<null>(socket, "msg:delete", id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    }
  }, []);

  const react = useCallback((id: string, emoji: string) => {
    socketRef.current?.emit("msg:react", { id, emoji });
  }, []);

  const reportTyping = useCallback((isTyping: boolean) => {
    socketRef.current?.emit("typing", isTyping);
  }, []);

  const markSeen = useCallback(() => {
    const socket = socketRef.current;
    const mine = meRef.current;
    if (!socket || !mine) return;
    const unseen = messagesRef.current
      .filter((m) => !m.status && m.kind !== "system" && m.authorId !== mine.id && !m.seenBy.includes(mine.id))
      .map((m) => m.id);
    if (unseen.length === 0) return;
    socket.emit("msg:seen", unseen);
    // Optimistic so we don't re-emit on every scroll tick.
    const ids = new Set(unseen);
    setMessages((current) =>
      current.map((m) => (ids.has(m.id) ? { ...m, seenBy: [...m.seenBy, mine.id] } : m)),
    );
  }, []);

  const kick = useCallback(async (memberId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    try {
      await ask<null>(socket, "host:kick", memberId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove that person");
    }
  }, []);

  const setLocked = useCallback((locked: boolean) => {
    socketRef.current?.emit("host:lock", locked);
  }, []);

  const leave = useCallback(() => {
    socketRef.current?.emit("room:leave");
    clearRoom(code);
    tokenRef.current = null;
  }, [code]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    phase,
    connected,
    error,
    peek,
    room,
    me,
    members,
    messages,
    typers,
    join,
    send,
    sendFiles,
    sendVoice,
    retry,
    remove: (id: string) => void remove(id),
    react,
    reportTyping,
    markSeen,
    kick,
    setLocked,
    leave,
    dismissError,
  };
}
