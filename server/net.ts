import { networkInterfaces } from "node:os";

/**
 * The whole point of the app is that people on the same Wi-Fi can reach it, so
 * we surface the LAN address rather than localhost.
 */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      out.push(iface.address);
    }
  }
  // 192.168.* / 10.* first — those are the ones a phone can actually reach.
  return out.sort((a, b) => rank(a) - rank(b));
}

function rank(ip: string): number {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  if (ip.startsWith("169.254.")) return 9;
  return 5;
}

export function primaryLanUrl(port: number): string {
  const [ip] = lanAddresses();
  return `http://${ip ?? "localhost"}:${port}`;
}
