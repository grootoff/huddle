import type { NextConfig } from "next";

const config: NextConfig = {
  // The app is served by our own HTTP server (see server/index.ts) so that
  // Socket.IO and Next share a single port — one URL to hand out on the LAN.
  reactStrictMode: true,
  // Devices join over the LAN IP, so allow those origins for dev assets/HMR.
  allowedDevOrigins: ["*.local", "192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12"],
};

export default config;
