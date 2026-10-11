// Read and check settings from the environment. Fails closed on anything the
// MCP endpoint's security depends on.

import { dirname, join } from "node:path";
import { ruleTitlesFromEnv } from "./rules.js";
import { DEFAULT_SKIP } from "./images/dish.js";

export function readConfig(env) {
  const errors = [];
  const mcpApiKey = env.MCP_API_KEY ?? "";
  if (mcpApiKey.length < 32)
    errors.push(
      "MCP_API_KEY must be set (at least 32 characters; openssl rand -hex 32)",
    );
  const port = parsePort(env.PORT ?? "3000");
  if (port === null)
    errors.push(
      "PORT must be a whole number from 0 to 65535 (0 = any free port)",
    );
  const viewerPort = parsePort(env.VIEWER_PORT ?? "3001");
  if (viewerPort === null)
    errors.push(
      "VIEWER_PORT must be a whole number from 0 to 65535 (0 = any free port)",
    );
  else if (viewerPort !== 0 && viewerPort === port)
    errors.push("VIEWER_PORT must differ from PORT");
  const tokenTtlHours = Number.parseInt(env.OAUTH_TOKEN_TTL_H ?? "168", 10);
  if (!Number.isInteger(tokenTtlHours) || tokenTtlHours <= 0)
    errors.push("OAUTH_TOKEN_TTL_H must be a positive integer");
  // Dish pictures (OpenSpec add-dish-images): off unless FOOD_IMAGE_URL is set.
  const foodImageUrl = (env.FOOD_IMAGE_URL ?? "").trim().replace(/\/+$/, "");
  const foodImageKey = env.FOOD_IMAGE_API_KEY ?? "";
  if (foodImageUrl) {
    if (!/^https?:\/\/[^\s/]+/.test(foodImageUrl))
      errors.push("FOOD_IMAGE_URL must be an http(s) URL");
    if (foodImageKey.length < 32)
      errors.push(
        "FOOD_IMAGE_API_KEY must be set (at least 32 characters) when FOOD_IMAGE_URL is",
      );
  }
  if (errors.length)
    throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);

  return {
    port,
    viewerPort,
    baseUrl: (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ""),
    dbPath: env.MEALS_DB || "/data/meals.db",
    mcpApiKey,
    oauth: {
      clientId: env.OAUTH_CLIENT_ID || undefined,
      clientSecret: env.OAUTH_CLIENT_SECRET || undefined,
      approvalPassword: env.OAUTH_APPROVAL_PASSWORD || undefined,
      tokenTtlHours,
    },
    ruleNotes: ruleTitlesFromEnv(env),
    dishImages: {
      url: foodImageUrl,
      apiKey: foodImageKey,
      dir:
        env.DISH_IMAGES_DIR ||
        join(dirname(env.MEALS_DB || "/data/meals.db"), "dish-images"),
      skip: env.DISH_IMAGE_SKIP
        ? env.DISH_IMAGE_SKIP.split(",")
            .map((p) => p.trim())
            .filter(Boolean)
        : DEFAULT_SKIP,
      size: 768,
    },
    // Umami (REPO-STANDARDS §11): off unless both are set.
    analytics: {
      scriptUrl: env.ANALYTICS_SCRIPT_URL || "",
      websiteId: env.ANALYTICS_WEBSITE_ID || "",
    },
  };
}

// A TCP port from an env string: digits only, 0–65535; anything else is null.
export function parsePort(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const port = Number(value);
  return port <= 65535 ? port : null;
}
