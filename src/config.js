// Read and check settings from the environment. Fails closed on anything the
// MCP endpoint's security depends on.

import { ruleTitlesFromEnv } from "./rules.js";

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
    ruleNotes: ruleTitlesFromEnv(env),
  };
}

// A TCP port from an env string: digits only, 0–65535; anything else is null.
export function parsePort(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const port = Number(value);
  return port <= 65535 ? port : null;
}
