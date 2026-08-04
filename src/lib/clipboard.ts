"use client";

/**
 * `navigator.clipboard` only exists in a secure context, and this app is served
 * over plain http on the LAN — so phones fall back to the old execCommand path.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const scratch = document.createElement("textarea");
    scratch.value = value;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.top = "-1000px";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    scratch.setSelectionRange(0, value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(scratch);
    return copied;
  } catch {
    return false;
  }
}
