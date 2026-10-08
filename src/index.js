// Entry point: read config, open the database, seed it if empty, serve.

import { readConfig } from "./config.js";
import { openStore } from "./store.js";
import { createRulesClient } from "./flatnotes.js";
import { seedIfEmpty } from "./seed/weeks.js";
import { createApp } from "./app.js";

let config;
try {
  config = readConfig(process.env);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const store = openStore(config.dbPath);
const seeded = seedIfEmpty(store, new Date().toISOString());
if (seeded)
  console.log(`Seeded ${seeded} example weeks into an empty database`);

const { loadRules } = createRulesClient(config.flatnotes);
const app = createApp({ store, loadRules, config });

const server = app.listen(config.port, () =>
  console.log(
    `meal-planner listening on :${config.port} (${config.baseUrl}), db ${config.dbPath}`,
  ),
);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () =>
    server.close(() => (store.close(), process.exit(0))),
  );
}
