export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  return `${mins}:${String(total % 60).padStart(2, "0")}`;
}

/** "Today" / "Yesterday" / "12 March" — the date separators in the thread. */
export function formatDayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Splits text so links can be rendered as anchors without dangerous HTML. */
export function linkify(text: string): Array<{ type: "text" | "link"; value: string; href?: string }> {
  const pattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  const out: Array<{ type: "text" | "link"; value: string; href?: string }> = [];
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > index) out.push({ type: "text", value: text.slice(index, start) });
    let value = match[0];
    // Don't swallow trailing punctuation into the URL.
    const trailing = /[.,!?;:)\]]+$/.exec(value);
    let tail = "";
    if (trailing) {
      tail = trailing[0];
      value = value.slice(0, -tail.length);
    }
    out.push({ type: "link", value, href: value.startsWith("http") ? value : `https://${value}` });
    if (tail) out.push({ type: "text", value: tail });
    index = start + match[0].length;
  }
  if (index < text.length) out.push({ type: "text", value: text.slice(index) });
  return out;
}

export function fileUrl(roomCode: string, attachmentId: string, download = false): string {
  return `/api/files/${roomCode}/${attachmentId}${download ? "?download=1" : ""}`;
}
