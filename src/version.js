// The app version, from package.json (its single source of truth), and the
// versioned URL of a static file. Each release asks for its own copy of every
// script and stylesheet, so neither the browser's cache nor the service
// worker's can hand a new page an old file.

import { readFileSync } from "node:fs";

export const APP_VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

export const asset = (path, version = APP_VERSION) => `${path}?v=${version}`;
