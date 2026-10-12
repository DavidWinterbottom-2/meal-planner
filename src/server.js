// Composition root: wires config, store and the two HTTP listeners together:
// the MCP listener (PORT, behind Apache) and the viewer listener (VIEWER_PORT,
// behind the entra-auth-proxy sidecar). Every listener goes in `servers`, so
// stop() closes them all before the store.

import { readConfig } from "./config.js";
import { openStore } from "./store.js";
import { seedIfEmpty } from "./seed/weeks.js";
import { createMcpApp } from "./mcp-app.js";
import { createViewerApp } from "./viewer-app.js";
import { createDishImageWorker } from "./images/worker.js";
import { sweepOrphanImages } from "./images/plan-image.js";

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
  const swept = sweepOrphanImages(
    config.planImagesDir,
    store.imageIds(),
    now().getTime(),
  );
  if (swept) log(`Removed ${swept} plan image files no week refers to`);

  const servers = [];
  try {
    servers.push(
      await listen(createMcpApp({ store, config, now }), config.port, host),
    );
    servers.push(
      await listen(
        createViewerApp({ store, config, now }),
        config.viewerPort,
        config.viewerHost ?? host,
      ),
    );
  } catch (e) {
    await Promise.all(servers.map(close));
    store.close();
    throw e;
  }
  // Dish pictures run in the background only when the food-image service is
  // configured; with it unset nothing is queued or generated.
  const worker = config.dishImages.url
    ? createDishImageWorker({ store, config, now, log })
    : null;
  worker?.start();

  log(
    `meal-planner MCP listening on :${servers[0].address().port} (${config.baseUrl}), viewer on :${servers[1].address().port}, db ${config.dbPath}`,
  );

  return {
    config,
    store,
    servers,
    async stop() {
      await worker?.stop();
      await Promise.all(servers.map(close));
      store.close();
    },
  };
}
