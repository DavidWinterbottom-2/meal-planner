// The HTTP host: health check, the shared OAuth2 authorization server, and
// the MCP endpoint behind x-api-key / bearer-token auth.

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { installOAuth2AuthorizationServer } from "./vendor/oauth2-authorization-server.js";
import { createMcpServer } from "./mcp.js";

export function createApp({
  store,
  loadRules,
  config,
  now = () => new Date(),
}) {
  const app = express();
  // Apache on the same host forwards requests; trust it for req.ip (used by
  // the OAuth module's rate limits and audit log), and nothing further out.
  app.set("trust proxy", "loopback, uniquelocal");
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));

  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "meal-planner" }),
  );

  const { requireAuth } = installOAuth2AuthorizationServer(app, {
    serviceName: "meal-planner",
    serviceDescription: "your family meal plans",
    baseUrl: config.baseUrl,
    mcpApiKey: config.mcpApiKey,
    oauthClientId: config.oauth.clientId,
    oauthClientSecret: config.oauth.clientSecret,
    tokenTtlHours: config.oauth.tokenTtlHours,
    approvalPassword: config.oauth.approvalPassword,
  });

  // Stateless StreamableHTTP: a fresh server + transport per request.
  app.all("/mcp", requireAuth, async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => transport.close());
      await createMcpServer({ store, loadRules, now }).connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("MCP request failed:", e);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        });
      }
    }
  });

  return app;
}
