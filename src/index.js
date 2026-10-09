// Entry point: start everything from the environment and stop it cleanly.

import { startServer } from "./server.js";

let running;
try {
  running = await startServer({ env: process.env });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => running.stop().then(() => process.exit(0)));
}
