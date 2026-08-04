import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * In development Next refuses to serve its own chunks and HMR endpoint to origins
 * it does not recognise. Since the whole point here is that other devices open the
 * LAN address, that block makes the page return 200 and then hang without ever
 * hydrating — so allow this machine's actual addresses.
 *
 * CIDR ranges are not supported, only literal hosts and wildcard patterns, hence
 * the interface walk. Evaluated when the server starts, so switching networks just
 * needs a restart. (Same logic as lanAddresses() in server/net.ts, duplicated
 * because next.config is loaded before the app's module graph exists.)
 */
function localOrigins(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1", "*.local"]);
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) hosts.add(iface.address);
    }
  }
  return [...hosts];
}

const config: NextConfig = {
  // The app is served by our own HTTP server (see server/index.ts) so that
  // Socket.IO and Next share a single port — one URL to hand out on the LAN.
  reactStrictMode: true,
  allowedDevOrigins: localOrigins(),
};

export default config;
