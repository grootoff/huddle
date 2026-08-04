"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { IS_SPLIT_DEPLOY, apiUrl } from "@/lib/config";
import { prettyRoomCode } from "@/lib/constants";
import { CopyIcon } from "./icons";
import { Modal, Spinner, cx } from "./ui";

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
  open,
  onClose,
  onCopied,
}: {
  code: string;
  roomName: string;
  open: boolean;
  onClose: () => void;
  onCopied: (message: string) => void;
}) {
  const [net, setNet] = useState<NetInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || net) return;
    let cancelled = false;
    // The link people should open is this page's origin, which is not the backend
    // origin when the UI is hosted separately.
    fetch(apiUrl(`/api/net?code=${code}&origin=${encodeURIComponent(window.location.origin)}`))
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
          <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.15em] break-all">{prettyRoomCode(code)}</p>
          <button
            onClick={() => void copy(code, "Code")}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-teal-600"
          >
            <CopyIcon width={13} height={13} /> Copy code
          </button>
          <p className="mt-2 text-[11px] text-zinc-500">
            This code is the room&apos;s only secret — anyone who has it can walk in.
          </p>
        </div>

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
              {IS_SPLIT_DEPLOY && (
                <p className="rounded-lg bg-zinc-100 px-3 py-2 text-center text-[11px] text-zinc-500 dark:bg-zinc-800">
                  This huddle is reachable from anywhere, not just your Wi-Fi. The code is the only thing keeping it
                  private.
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
          {IS_SPLIT_DEPLOY
            ? `${roomName} lives on the machine running the Huddle backend.`
            : `${roomName} lives only on this machine — nothing is uploaded to the internet.`}
        </p>
      </div>
    </Modal>
  );
}
