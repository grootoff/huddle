import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Huddle — chat on your Wi-Fi",
  description: "Spin up a private chat room for everyone on the same network. No accounts, no cloud.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  // The composer stays reachable when a phone keyboard is open.
  interactiveWidget: "resizes-content",
};

/** Applied before paint so a dark-mode reload never flashes white. */
const themeBootstrap = `
try {
  var saved = localStorage.getItem("huddle:theme");
  var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
