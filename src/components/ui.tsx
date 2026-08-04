"use client";

import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { XIcon } from "./icons";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- buttons -------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "subtle" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-teal-600 text-white shadow-sm hover:bg-teal-500 active:bg-teal-700 disabled:bg-teal-600/50 dark:bg-teal-500 dark:hover:bg-teal-400 dark:active:bg-teal-600",
  subtle:
    "bg-zinc-200/80 text-zinc-800 hover:bg-zinc-300/80 active:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
  ghost: "text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white",
  danger: "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-sm rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-5 text-base rounded-xl gap-2",
};

export function Button({ variant = "primary", size = "md", block, className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center font-medium transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
    />
  );
}

export function IconButton({
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={cx(
        "inline-flex size-9 items-center justify-center rounded-full text-zinc-600 transition-colors outline-none",
        "hover:bg-zinc-900/5 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-teal-500/60",
        "dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

/* ---------------------------------- fields -------------------------------- */

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** React 19 passes refs to function components as a plain prop. */
  ref?: Ref<HTMLInputElement>;
};

export function Field({ label, hint, error, className, id, ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        id={inputId}
        {...rest}
        className={cx(
          "h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-zinc-900 outline-none transition",
          "placeholder:text-zinc-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15",
          "dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500",
          error ? "border-rose-400 dark:border-rose-500" : "border-zinc-200 dark:border-zinc-700",
          className,
        )}
      />
      {(error || hint) && (
        <span className={cx("mt-1.5 block text-xs", error ? "text-rose-600 dark:text-rose-400" : "text-zinc-500")}>
          {error || hint}
        </span>
      )}
    </label>
  );
}

/* ---------------------------------- modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="animate-rise w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl outline-none sm:rounded-2xl dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <XIcon />
          </IconButton>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- feedback ------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Bottom-centre transient message. */
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-60 flex justify-center px-4">
      <div className="animate-rise pointer-events-auto flex max-w-sm items-center gap-3 rounded-full bg-zinc-900 py-2.5 pr-2.5 pl-4 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
        <span className="min-w-0 flex-1 truncate">{message}</span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded-full p-1 opacity-70 transition hover:opacity-100"
        >
          <XIcon width={14} height={14} />
        </button>
      </div>
    </div>
  );
}
