/**
 * Shared contract between the Socket.IO server (server/*) and the browser
 * client (src/*). Types only — this module is fully erased at runtime.
 */

export type AttachmentKind = "image" | "video" | "audio" | "file";
export type MessageKind = "text" | "file" | "system";

export interface Attachment {
  /** Opaque id; the bytes live at /api/files/:roomCode/:id */
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: AttachmentKind;
  /** Intrinsic media size, used to reserve layout space before load. */
  width?: number;
  height?: number;
  /** Seconds, for audio/video. */
  duration?: number;
}

export interface Member {
  id: string;
  name: string;
  /** Deterministic avatar/name hue, assigned at join time. */
  color: string;
  isHost: boolean;
  online: boolean;
  joinedAt: number;
}

export interface ReplyPreview {
  id: string;
  authorName: string;
  preview: string;
}

export interface Message {
  id: string;
  seq: number;
  kind: MessageKind;
  authorId: string | null;
  authorName: string;
  authorColor: string;
  body: string;
  attachment: Attachment | null;
  replyTo: ReplyPreview | null;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
  /** emoji -> member ids */
  reactions: Record<string, string[]>;
  /** member ids that have seen this message (never includes the author) */
  seenBy: string[];
}

export interface RoomInfo {
  code: string;
  name: string;
  hostId: string;
  locked: boolean;
  hasPasskey: boolean;
  createdAt: number;
}

export interface RoomState {
  room: RoomInfo;
  me: Member;
  members: Member[];
  messages: Message[];
  /** Credential the client stores so a refresh keeps the same identity. */
  token: string;
}

/* ---------------------------------- acks --------------------------------- */

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface CreateRoomInput {
  roomName: string;
  displayName: string;
  /** Optional join key set by the host. Empty/undefined = open room. */
  passkey?: string;
}

export interface JoinRoomInput {
  code: string;
  displayName: string;
  passkey?: string;
  /** Present when rejoining after a refresh. */
  token?: string;
}

export interface SendMessageInput {
  /** Client-generated id so the optimistic bubble can be reconciled. */
  id: string;
  body: string;
  attachment?: Attachment | null;
  replyToId?: string | null;
}

export interface RoomPeek {
  code: string;
  name: string;
  hasPasskey: boolean;
  locked: boolean;
  memberCount: number;
}

/* --------------------------------- events -------------------------------- */

export interface ClientToServerEvents {
  "room:create": (input: CreateRoomInput, ack: Ack<RoomState>) => void;
  "room:join": (input: JoinRoomInput, ack: Ack<RoomState>) => void;
  "room:peek": (code: string, ack: Ack<RoomPeek>) => void;
  "room:leave": () => void;
  "msg:send": (input: SendMessageInput, ack: Ack<Message>) => void;
  "msg:delete": (id: string, ack: Ack<null>) => void;
  "msg:react": (input: { id: string; emoji: string }) => void;
  "msg:seen": (ids: string[]) => void;
  typing: (isTyping: boolean) => void;
  "host:kick": (memberId: string, ack: Ack<null>) => void;
  "host:lock": (locked: boolean) => void;
}

export interface ServerToClientEvents {
  "msg:new": (message: Message) => void;
  "msg:patch": (patch: { id: string; reactions?: Record<string, string[]>; deleted?: boolean; body?: string }) => void;
  "msg:seen": (patch: { memberId: string; ids: string[] }) => void;
  presence: (members: Member[]) => void;
  typing: (patch: { memberId: string; name: string; isTyping: boolean }) => void;
  "room:patch": (patch: Partial<Pick<RoomInfo, "locked" | "name">>) => void;
  kicked: (reason: string) => void;
}

export interface SocketData {
  memberId?: string;
  roomCode?: string;
}
