"use client";

import { initials } from "@/lib/format";
import { cx } from "./ui";

export function Avatar({
  name,
  color,
  size = 36,
  online,
  className,
}: {
  name: string;
  color: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span
        className="flex size-full items-center justify-center rounded-full font-semibold text-white select-none"
        style={{
          // Two-tone so avatars stay legible on both themes.
          backgroundImage: `linear-gradient(140deg, ${color}, ${color}bb)`,
          fontSize: Math.max(10, Math.round(size * 0.36)),
        }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      {online !== undefined && (
        <span
          className={cx(
            "absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-white dark:ring-zinc-900",
            online ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600",
          )}
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
          title={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}
