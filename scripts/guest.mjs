/**
 * Simulates another person on the network — handy for trying the UI on your own
 * without a second device.
 *
 *   node scripts/guest.mjs <code> [name] [message] [--stay 60]
 *
 * The guest joins, says something, reacts to and reads whatever it sees, then
 * stays connected so you can watch presence and typing indicators.
 */
import { io } from "socket.io-client";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  args.splice(index, 2);
  return value ?? fallback;
};

const origin = flag("origin", "http://localhost:4000");
const stayFor = Number(flag("stay", "60"));
const [rawCode, name = "Priya", message = "Hello from another device"] = args;
const code = (rawCode ?? "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");

if (!/^[A-HJ-KM-NP-Z0-9]{8}$/.test(code)) {
  console.error("usage: node scripts/guest.mjs <8-char-code> [name] [message] [--stay seconds]");
  process.exit(1);
}

const socket = io(origin, { transports: ["websocket"] });

const ask = (event, payload) =>
  new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (timeout, response) => {
      if (timeout) return reject(new Error(`${event} timed out`));
      if (!response?.ok) return reject(new Error(response?.error ?? `${event} failed`));
      resolve(response.data);
    });
  });

socket.on("connect", async () => {
  try {
    const state = await ask("room:join", { code, displayName: name });
    console.log(`${name} joined "${state.room.name}" (${state.members.length} members)`);

    // Read everything already on screen, so the host sees blue ticks.
    const unread = state.messages.filter((m) => m.kind !== "system" && m.authorId !== state.me.id).map((m) => m.id);
    if (unread.length) socket.emit("msg:seen", unread);

    socket.emit("typing", true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    socket.emit("typing", false);

    const sent = await ask("msg:send", { id: crypto.randomUUID(), body: message });
    console.log(`said: ${sent.body}`);

    const lastFromOthers = [...state.messages].reverse().find((m) => m.kind !== "system" && m.authorId !== state.me.id);
    if (lastFromOthers) {
      socket.emit("msg:react", { id: lastFromOthers.id, emoji: "❤️" });
      console.log(`reacted to: ${lastFromOthers.body || "an attachment"}`);
    }
  } catch (error) {
    console.error(`failed: ${error.message}`);
    process.exit(1);
  }
});

socket.on("msg:new", (m) => {
  if (m.kind === "system") return;
  console.log(`< ${m.authorName}: ${m.body || `[${m.attachment?.kind}] ${m.attachment?.name}`}`);
  socket.emit("msg:seen", [m.id]);
});
socket.on("kicked", (reason) => {
  console.log(`kicked: ${reason}`);
  process.exit(0);
});

console.log(`staying connected for ${stayFor}s — ctrl-c to leave early`);
setTimeout(() => {
  socket.emit("room:leave");
  socket.close();
  process.exit(0);
}, stayFor * 1000);
