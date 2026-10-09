// Composition root: wires config, store, rules client and the HTTP
// listeners together. Every listener goes in `servers`, so stop() closes
// them all before the store — the viewer listener (add-week-viewer) joins
// this list rather than getting its own shutdown path.

import { readConfig } from "./config.js";
import { openStore } from "./store.js";
import { createRulesClient } from "./flatnotes.js";
import { seedIfEmpty } from "./seed/weeks.js";
import { createMcpApp } from "./mcp-app.js";

// Express 5 hands a listen error (e.g. EADDRINUSE) to the callback.
function listen(app, port, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, (err) =>
      err ? reject(err) : resolve(server),
    );
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function startServer({
  env,
  now = () => new Date(),
  host,
  log = console.log,
}) {
  const config = readConfig(env);
  const store = openStore(config.dbPath);
  const seeded = seedIfEmpty(store, now().toISOString());
  if (seeded) log(`Seeded ${seeded} example weeks into an empty database`);

  const { loadRules } = createRulesClient(config.flatnotes);
  const servers = [];
  try {
    servers.push(
      await listen(
        createMcpApp({ store, loadRules, config, now }),
        config.port,
        host,
      ),
    );
  } catch (e) {
    await Promise.all(servers.map(close));
    store.close();
    throw e;
  }
  log(
    `meal-planner MCP listening on :${servers[0].address().port} (${config.baseUrl}), db ${config.dbPath}`,
  );

  return {
    config,
    store,
    servers,
    async stop() {
      await Promise.all(servers.map(close));
      store.close();
    },
  };
}
