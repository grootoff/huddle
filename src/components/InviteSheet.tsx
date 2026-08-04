"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { loadHostKey } from "@/lib/session";
import { CopyIcon, LockIcon } from "./icons";
import { Button, Modal, Spinner, cx } from "./ui";

interface NetInfo {
  origin: string;
  joinUrl: string;
  qr: string;
  alternates: string[];
  servedOverLan: boolean;
}

/** Everything someone needs to walk over and join: code, link, QR, key. */
export function InviteSheet({
  code,
  roomName,
  isHost,
  open,
  onClose,
  onCopied,
}: {
  code: string;
  roomName: string;
  isHost: boolean;
  open: boolean;
  onClose: () => void;
  onCopied: (message: string) => void;
}) {
  const [net, setNet] = useState<NetInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const hostKey = isHost ? loadHostKey(code) : "";

  useEffect(() => {
    if (!open || net) return;
    let cancelled = false;
    fetch(`/api/net?code=${code}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("net"))))
      .then((data: NetInfo) => {
        if (!cancelled) setNet(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, code, net]);

  const copy = async (value: string, label: string) => {
    onCopied((await copyText(value)) ? `${label} copied` : "Copy failed — select it by hand");
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite people">
      <div className="space-y-4">
        <div className="rounded-xl bg-zinc-100 p-4 text-center dark:bg-zinc-800/70">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Room code</p>
          <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.2em] tabular-nums">{code}</p>
          <button
            onClick={() => void copy(code, "Code")}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-teal-600"
          >
            <CopyIcon width={13} height={13} /> Copy code
          </button>
        </div>

        {hostKey && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <LockIcon className="shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Join key (only you see this)</p>
              <p className="truncate font-mono text-sm tracking-wider">{hostKey}</p>
            </div>
            <Button variant="subtle" size="sm" onClick={() => void copy(hostKey, "Key")}>
              Copy
            </Button>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          {net ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={net.qr}
                alt={`QR code linking to ${net.joinUrl}`}
                width={176}
                height={176}
                className="rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700"
              />
              <p className="text-center text-xs text-zinc-500">
                Scan with a phone camera on this Wi-Fi, or open
                <button
                  onClick={() => void copy(net.joinUrl, "Link")}
                  className="mt-0.5 block w-full truncate font-mono text-[13px] text-teal-700 underline decoration-dotted underline-offset-2 dark:text-teal-400"
                >
                  {net.joinUrl}
                </button>
              </p>
              {!net.servedOverLan && (
                <p className="rounded-lg bg-zinc-100 px-3 py-2 text-center text-[11px] text-zinc-500 dark:bg-zinc-800">
                  You opened this on localhost. Other devices need the address above — make sure they are on the same
                  network.
                </p>
              )}
              {net.alternates.length > 1 && (
                <details className="w-full text-xs text-zinc-500">
                  <summary className="cursor-pointer text-center">Other addresses on this machine</summary>
                  <ul className="mt-2 space-y-1">
                    {net.alternates.map((url) => (
                      <li key={url} className="truncate text-center font-mono">
                        {url}/r/{code}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : failed ? (
            <p className="text-xs text-zinc-500">Could not work out this machine&apos;s address.</p>
          ) : (
            <div className={cx("flex h-44 items-center justify-center text-zinc-400")}>
              <Spinner />
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-zinc-400">
          {roomName} lives only on this machine — nothing is uploaded to the internet.
        </p>
      </div>
    </Modal>
  );
}
