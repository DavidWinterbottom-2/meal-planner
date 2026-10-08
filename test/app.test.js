import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { openStore } from "../src/store.js";
import { seedIfEmpty } from "../src/seed/weeks.js";

const KEY = "k".repeat(64);
const APPROVAL = "correct horse battery staple";
const NOW = new Date("2026-10-15T10:00:00Z");

let server, base, store;

beforeAll(async () => {
  store = openStore();
  seedIfEmpty(store, "2026-10-01T00:00:00.000Z");
  const config = readConfig({
    MCP_API_KEY: KEY,
    OAUTH_APPROVAL_PASSWORD: APPROVAL,
    BASE_URL: "http://test",
  });
  const loadRules = async () => ({ sections: {}, missing: [], error: null });
  const app = createApp({ store, loadRules, config, now: () => NOW });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
  server.close();
  store.close();
});

const rpc = (body, headers = {}) =>
  fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });

// The JSON-RPC result from a StreamableHTTP response (SSE "data:" line or JSON).
async function rpcResult(res) {
  const text = await res.text();
  const data = text.startsWith("{")
    ? text
    : text
        .split("\n")
        .find((l) => l.startsWith("data: "))
        .slice(6);
  return JSON.parse(data);
}

describe("HTTP host", () => {
  test("/health needs no credentials", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "meal-planner" });
  });

  test("/mcp without credentials is 401 with resource metadata", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://test/.well-known/oauth-protected-resource"',
    );
  });

  test("/mcp with a wrong API key is 401", async () => {
    const res = await rpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { "x-api-key": "nope" },
    );
    expect(res.status).toBe(401);
  });

  test("/mcp with the API key serves a tool call", async () => {
    const res = await rpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_week_plan", arguments: { week: "current" } },
      },
      { "x-api-key": KEY },
    );
    expect(res.status).toBe(200);
    const { result } = await rpcResult(res);
    expect(result.content[0].text).toMatch(/^Week of Mon 12 Oct/);
  });

  test("OAuth metadata is public and points at this server", async () => {
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect((await res.json()).authorization_endpoint).toBe(
      "http://test/oauth/authorize",
    );
  });
});

describe("OAuth consent needs the approval password", () => {
  const redirect = "https://claude.ai/api/mcp/auth_callback";
  const verifier = "v".repeat(50);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let clientId, clientSecret;

  beforeAll(async () => {
    const res = await fetch(`${base}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [redirect], client_name: "test" }),
    });
    ({ client_id: clientId, client_secret: clientSecret } = await res.json());
  });

  const approve = (extra) =>
    fetch(`${base}/oauth/authorize`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        code_challenge: challenge,
        code_challenge_method: "S256",
        approve: "1",
        ...extra,
      }),
    });

  test("approving without the password issues no code", async () => {
    const res = await approve({});
    expect(res.status).toBe(403);
    expect(res.headers.get("location")).toBeNull();
  });

  test("a wrong approval password issues no code", async () => {
    const res = await approve({ password: "guess" });
    expect(res.status).toBe(403);
    expect(res.headers.get("location")).toBeNull();
  });

  test("the approved code buys a bearer token that works on /mcp", async () => {
    const res = await approve({ password: APPROVAL });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location"));
    expect(`${location.origin}${location.pathname}`).toBe(redirect);
    const tokenRes = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: location.searchParams.get("code"),
        redirect_uri: redirect,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: verifier,
      }),
    });
    expect(tokenRes.status).toBe(200);
    const { access_token } = await tokenRes.json();
    const call = (token) =>
      rpc(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_weeks", arguments: {} },
        },
        { authorization: `Bearer ${token}` },
      );
    const ok = await call(access_token);
    expect(ok.status).toBe(200);
    expect((await rpcResult(ok)).result.content[0].text).toMatch(/2026-10-12/);
    expect((await call("not-a-real-token")).status).toBe(401);
  });
});

describe("errors", () => {
  test("malformed JSON gets a plain 400, never a stack trace", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY },
      body: "{bad",
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Bad request" });
    expect(text).not.toMatch(/node_modules|at /);
  });
});

describe("readConfig", () => {
  test("requires a long MCP_API_KEY", () => {
    expect(() => readConfig({})).toThrow(/MCP_API_KEY must be set/);
    expect(() => readConfig({ MCP_API_KEY: "short" })).toThrow(/at least 32/);
  });

  test("rejects a bad port or token TTL", () => {
    expect(() => readConfig({ MCP_API_KEY: KEY, PORT: "x" })).toThrow(/PORT/);
    expect(() =>
      readConfig({ MCP_API_KEY: KEY, OAUTH_TOKEN_TTL_H: "0" }),
    ).toThrow(/OAUTH_TOKEN_TTL_H/);
  });

  test("applies defaults and trims trailing slashes", () => {
    const c = readConfig({
      MCP_API_KEY: KEY,
      BASE_URL: "https://mcp.winterbottom.xyz/meals/",
    });
    expect(c).toMatchObject({
      port: 3000,
      baseUrl: "https://mcp.winterbottom.xyz/meals",
      dbPath: "/data/meals.db",
      oauth: { tokenTtlHours: 168, approvalPassword: undefined },
      flatnotes: { url: "http://flatnotes:8080", username: "" },
    });
    expect(c.flatnotes.titles.household).toBe("Meals - Household");
    expect(readConfig({ MCP_API_KEY: KEY }).baseUrl).toBe(
      "http://localhost:3000",
    );
  });
});
