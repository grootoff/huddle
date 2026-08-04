/**
 * Huddle is served over plain http on a LAN, which is NOT a "secure context".
 * A handful of browser APIs silently vanish there — and every one of them works
 * on localhost, so this class of bug passes local testing and breaks on the only
 * address that matters.
 *
 * This walks src/ and fails if one of those APIs is used without a guard in the
 * same file. Grep-based and deliberately dumb: it is a tripwire, not a compiler.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "src");

/** Each API, and the tokens that count as handling it. */
const RULES = [
  {
    api: "crypto.randomUUID",
    pattern: /\bcrypto\.randomUUID\b/,
    guards: [/typeof\s+crypto\.randomUUID\s*===\s*["']function["']/],
    advice: 'use clientId() from "@/lib/id"',
  },
  {
    api: "crypto.subtle",
    pattern: /\bcrypto\.subtle\b/,
    guards: [/isSecureContext/],
    advice: "unavailable over plain http — gate on window.isSecureContext",
  },
  {
    api: "navigator.clipboard",
    pattern: /\bnavigator\.clipboard\b/,
    guards: [/isSecureContext/],
    advice: 'use copyText() from "@/lib/clipboard"',
  },
  {
    api: "navigator.mediaDevices",
    pattern: /\bnavigator\.mediaDevices\b/,
    guards: [/isSecureContext/],
    advice: "gate on window.isSecureContext and tell the user why",
  },
  {
    api: "navigator.serviceWorker",
    pattern: /\bnavigator\.serviceWorker\b/,
    guards: [/isSecureContext/],
    advice: "service workers do not register over plain http",
  },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  for (const rule of RULES) {
    if (!rule.pattern.test(source)) continue;
    if (rule.guards.some((guard) => guard.test(source))) continue;
    const line = source.split("\n").findIndex((text) => rule.pattern.test(text)) + 1;
    failures.push(`${path.relative(path.join(ROOT, ".."), file)}:${line}  ${rule.api} — ${rule.advice}`);
  }
}

if (failures.length > 0) {
  console.error("\n  Secure-context-only APIs used without a fallback:\n");
  for (const failure of failures) console.error(`    ${failure}`);
  console.error(`\n  These are undefined on http://192.168.x.x, which is where Huddle actually runs.\n`);
  process.exit(1);
}

console.log("secure-context check passed");
