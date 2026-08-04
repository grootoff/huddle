/**
 * The server is run straight from TypeScript (`node server/index.ts`) and stores
 * data in `node:sqlite`. Both are recent Node features, and when they are missing
 * Node fails with something unhelpful like `Unknown file extension ".ts"`. This
 * turns that into an answer.
 */
const [major, minor] = process.versions.node.split(".").map(Number);
const problems = [];

// Type stripping is on by default from 23.6; before that it needs a flag.
if (major < 23 || (major === 23 && minor < 6)) {
  problems.push(`running TypeScript directly needs Node 23.6 or newer (you have ${process.versions.node})`);
}

try {
  await import("node:sqlite");
} catch {
  problems.push(`the built-in "node:sqlite" module is unavailable (Node 24+ has it unflagged)`);
}

if (problems.length > 0) {
  console.error("\n  Huddle cannot start on this Node version:\n");
  for (const problem of problems) console.error(`    - ${problem}`);
  console.error(`\n  Install Node 24 and try again, for example:\n`);
  console.error(`    nvm install 24 && nvm use 24        # or: brew install node`);
  console.error(`    node -v                             # expect v24.x\n`);
  process.exit(1);
}
