"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRoom, type ChatMessage } from "@/hooks/useRoom";
import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { InviteSheet } from "./InviteSheet";
import { JoinGate } from "./JoinGate";
import { Lightbox } from "./Lightbox";
import { MembersSheet } from "./MembersSheet";
import { MessageList } from "./MessageList";
import { PaperclipIcon, UsersIcon } from "./icons";
import { Button, Spinner, Toast } from "./ui";

interface LightboxState {
  src: string;
  name: string;
  downloadUrl?: string;
}

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const api = useRoom(code);
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const dragDepth = useRef(0);
  const lastSeenCount = useRef(0);
  const invitedOnce = useRef(false);
  const backgroundUnread = useRef(0);

  /* Surface hook errors as a transient toast rather than a dead-end screen. */
  useEffect(() => {
    if (api.phase === "joined" && api.error) {
      setToast(api.error);
      api.dismissError();
    }
  }, [api.error, api.phase, api.dismissError]);

  /* Nudge + tab badge when a message lands while the tab is in the background. */
  useEffect(() => {
    const previous = lastSeenCount.current;
    lastSeenCount.current = api.messages.length;
    if (previous === 0 || api.messages.length <= previous) return;

    const last = api.messages[api.messages.length - 1];
    if (last.authorId === api.me?.id || last.kind === "system") return;
    if (document.visibilityState === "visible") return;

    backgroundUnread.current += 1;
    document.title = `(${backgroundUnread.current}) ${api.room?.name ?? "Huddle"}`;
    chime();
  }, [api.messages, api.me?.id, api.room?.name]);

  useEffect(() => {
    const clear = () => {
      if (document.visibilityState !== "visible") return;
      backgroundUnread.current = 0;
      document.title = api.room?.name ? `${api.room.name} · Huddle` : "Huddle";
    };
    clear();
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, [api.room?.name]);

  /* Paste an image straight into the room. */
  useEffect(() => {
    if (api.phase !== "joined") return;
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      api.sendFiles(files, reply?.id ?? null);
      setReply(null);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [api, api.phase, reply?.id]);

  /* The host lands in an empty room — show them how to get people in. */
  useEffect(() => {
    if (invitedOnce.current || api.phase !== "joined" || !api.room || !api.me) return;
    if (api.me.id !== api.room.hostId) return;
    if (api.members.length > 1) return;
    invitedOnce.current = true;
    setInviteOpen(true);
  }, [api.phase, api.room, api.me, api.members.length]);

  const openImage = useCallback((src: string, name: string, downloadUrl?: string) => {
    setLightbox({ src, name, downloadUrl });
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      api.send({ body: text, replyToId: reply?.id ?? null });
      setReply(null);
    },
    [api, reply?.id],
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      api.sendFiles(files, reply?.id ?? null);
      setReply(null);
    },
    [api, reply?.id],
  );

  const leave = useCallback(() => {
    api.leave();
    router.push("/");
  }, [api, router]);

  /* ------------------------------- gate states ------------------------------ */

  if (api.phase === "connecting") {
    return (
      <Centered>
        <Spinner className="size-6 text-teal-600" />
        <p className="mt-4 text-sm text-zinc-500">Looking for huddle {code}…</p>
      </Centered>
    );
  }

  if (api.phase === "denied") {
    return (
      <Centered>
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <UsersIcon width={24} height={24} />
          </div>
          <h1 className="text-lg font-semibold">Can&apos;t open this huddle</h1>
          <p className="mt-1.5 text-sm text-zinc-500">{api.error ?? "It may have expired."}</p>
          <Button className="mt-5" block onClick={() => router.push("/")}>
            Back to start
          </Button>
        </div>
      </Centered>
    );
  }

  if (api.phase === "gate" || api.phase === "joining" || !api.room || !api.me) {
    return (
      <JoinGate
        code={code}
        peek={api.peek}
        error={api.error}
        busy={api.phase === "joining"}
        onJoin={(input) => void api.join(input)}
      />
    );
  }

  /* --------------------------------- chat ---------------------------------- */

  return (
    <div
      className="flex h-dvh flex-col"
      onDragEnter={(event) => {
        if (!event.dataTransfer?.types.includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (files.length) handleFiles(files);
      }}
    >
      <ChatHeader
        room={api.room}
        members={api.members}
        me={api.me}
        connected={api.connected}
        onInvite={() => setInviteOpen(true)}
        onMembers={() => setMembersOpen(true)}
        onLeave={leave}
      />

      <MessageList
        messages={api.messages}
        me={api.me}
        members={api.members}
        hostId={api.room.hostId}
        roomCode={code}
        typers={api.typers}
        onReply={setReply}
        onReact={api.react}
        onDelete={api.remove}
        onRetry={api.retry}
        onOpenImage={openImage}
        onMarkSeen={api.markSeen}
      />

      <Composer
        onSend={handleSend}
        onFiles={handleFiles}
        onVoice={api.sendVoice}
        onTyping={api.reportTyping}
        onError={setToast}
        reply={reply}
        onCancelReply={() => setReply(null)}
        disabled={!api.connected}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-teal-950/40 backdrop-blur-sm">
          <div className="animate-pop flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-white/70 px-10 py-8 text-white">
            <PaperclipIcon width={30} height={30} />
            <p className="text-base font-medium">Drop to send</p>
            <p className="text-xs opacity-80">Up to 100 MB per file</p>
          </div>
        </div>
      )}

      <InviteSheet
        code={code}
        roomName={api.room.name}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCopied={setToast}
      />

      <MembersSheet
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={api.members}
        me={api.me}
        hostId={api.room.hostId}
        locked={api.room.locked}
        onKick={(memberId) => void api.kick(memberId)}
        onToggleLock={api.setLocked}
      />

      {lightbox && (
        <Lightbox
          src={lightbox.src}
          name={lightbox.name}
          downloadUrl={lightbox.downloadUrl}
          onClose={() => setLightbox(null)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      {children}
      <Link href="/" className="mt-6 text-xs text-zinc-400 underline decoration-dotted underline-offset-2">
        Huddle home
      </Link>
    </main>
  );
}

/** Short, quiet notification tone — no audio asset to ship. */
function chime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    setTimeout(() => void ctx.close(), 400);
  } catch {
    /* audio is a nicety, never a requirement */
  }
}
