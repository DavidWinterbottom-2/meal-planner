// Read and check settings from the environment. Fails closed on anything the
// MCP endpoint's security depends on.

import { ruleTitlesFromEnv } from "./flatnotes.js";

export function readConfig(env) {
  const errors = [];
  const mcpApiKey = env.MCP_API_KEY ?? "";
  if (mcpApiKey.length < 32)
    errors.push(
      "MCP_API_KEY must be set (at least 32 characters; openssl rand -hex 32)",
    );
  const port = Number.parseInt(env.PORT ?? "3000", 10);
  if (!Number.isInteger(port) || port <= 0)
    errors.push("PORT must be a positive integer");
  const tokenTtlHours = Number.parseInt(env.OAUTH_TOKEN_TTL_H ?? "168", 10);
  if (!Number.isInteger(tokenTtlHours) || tokenTtlHours <= 0)
    errors.push("OAUTH_TOKEN_TTL_H must be a positive integer");
  if (errors.length)
    throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);

  return {
    port,
    baseUrl: (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ""),
    dbPath: env.MEALS_DB || "/data/meals.db",
    mcpApiKey,
    oauth: {
      clientId: env.OAUTH_CLIENT_ID || undefined,
      clientSecret: env.OAUTH_CLIENT_SECRET || undefined,
      approvalPassword: env.OAUTH_APPROVAL_PASSWORD || undefined,
      tokenTtlHours,
    },
    flatnotes: {
      url: (env.FLATNOTES_URL || "http://flatnotes:8080").replace(/\/+$/, ""),
      username: env.FLATNOTES_USER || "",
      password: env.FLATNOTES_PASS || "",
      titles: ruleTitlesFromEnv(env),
    },
  };
}
