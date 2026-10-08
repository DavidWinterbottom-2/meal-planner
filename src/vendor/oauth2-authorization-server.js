// Canonical copy: shared/oauth2-authorization-server.js
//
// This file is vendored byte-for-byte into every *-mcp/ server that needs
// OAuth2 (dynamic client registration + PKCE authorization-code flow, so
// Claude/ChatGPT can connect without a shared static secret). Each server
// directory has to stay a self-contained Docker build context (see the repo
// CLAUDE.md), so this can't be a runtime import across directories — it's
// synced instead, the same way docker-infra vendors its design system.
//
// scripts/check-shared-module-sync.js fails CI if a server's copy drifts
// from this one. To change the OAuth server behaviour: edit this file, then
// copy it verbatim over every `<service>-mcp/oauth2-authorization-server.js`.
//
// Pure, framework-free logic lives here so it's unit-testable without
// spinning up Express — see oauth2-authorization-server.test.js. The one
// framework-touching export, installOAuth2AuthorizationServer, is a thin
// wiring layer that composes the pure functions onto an Express app.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import express from "express";

export function generateToken() {
  return randomBytes(32).toString("hex");
}

export function verifyPKCE(verifier, challenge, method) {
  if (typeof verifier !== "string" || typeof challenge !== "string") return false;
  if (method === "S256")
    return createHash("sha256").update(verifier).digest("base64url") === challenge;
  return verifier === challenge;
}

// PKCE is mandatory (OAuth 2.1, and the MCP auth spec): /oauth/authorize
// only accepts an S256 challenge, which is the base64url sha256 of the
// verifier — always exactly 43 characters. "plain" is refused (it puts the
// verifier itself in the browser URL), as is a missing challenge.
export function isValidPKCEChallenge({ codeChallenge, codeChallengeMethod }) {
  return codeChallengeMethod === "S256" && typeof codeChallenge === "string" && /^[A-Za-z0-9_-]{43}$/.test(codeChallenge);
}

// One audit line per consent decision, granted or refused, so a leaked
// approval password shows up in `docker logs`. Client-supplied values are
// JSON-quoted (no log-line injection). Behind the Apache proxy `ip` is the
// proxy's address, so the X-Forwarded-For Apache adds is logged too — it's
// only trustworthy for requests that came through Apache.
export function formatApprovalLog({ outcome, clientId, clientName, redirectUri, ip, forwardedFor }) {
  return `OAuth approval ${outcome}: client=${JSON.stringify(clientName || "unnamed")} (${clientId}) ` +
    `redirect_uri=${JSON.stringify(redirectUri)} ip=${ip} x-forwarded-for=${JSON.stringify(forwardedFor ?? "")}`;
}

export function escHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Is this client_id one the token endpoint / authorize endpoint should
// recognise at all — either the operator-configured static client, or one
// that went through dynamic registration.
export function isKnownClient({ clientId, oauthClientId, registeredClients }) {
  const isStaticClient = Boolean(oauthClientId) && clientId === oauthClientId;
  return isStaticClient || registeredClients.has(clientId);
}

// Is redirectUri one this client is allowed to receive codes at. A dynamic
// client must have registered it exactly (no prefix/substring matching —
// that's how codes get delivered to an attacker's URL). The operator-
// configured static client has no registered list (it's set up by hand in
// claude.ai with OAUTH_CLIENT_ID/SECRET), so any parseable URI is accepted
// for it: a code sent elsewhere is useless without OAUTH_CLIENT_SECRET.
export function isRegisteredRedirect({ clientId, redirectUri, oauthClientId, registeredClients }) {
  if (typeof redirectUri !== "string" || !redirectUri) return false;
  const dynamic = typeof clientId === "string" ? registeredClients.get(clientId) : undefined;
  if (dynamic) return dynamic.redirectUris.includes(redirectUri);
  if (Boolean(oauthClientId) && clientId === oauthClientId) return isAllowedRedirectUrl(redirectUri);
  return false;
}

// A redirect target codes may be sent to: https anywhere, or plain http only
// to the loopback interface (native/CLI clients' local callback listeners).
export function isAllowedRedirectUrl(val) {
  let url;
  try {
    url = new URL(val);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

// Validates a /oauth/register redirect_uris value: a non-empty array (not a
// string — a string has a .length and an .includes() that substring-matches)
// of a bounded number of https (or loopback http) URLs. Returns the array, or null if invalid.
export const MAX_REDIRECT_URIS = 10;
export function normalizeRedirectUris(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REDIRECT_URIS) return null;
  if (!value.every(u => typeof u === "string" && u.length <= 2048 && isAllowedRedirectUrl(u))) return null;
  return [...value];
}

// Stores a newly-registered client, evicting the oldest registrations once
// `max` is reached so anonymous /oauth/register calls can't grow memory
// without bound. Map iteration order is insertion order, so the first key is
// the oldest.
export const MAX_REGISTERED_CLIENTS = 100;
export function rememberClient(registeredClients, clientId, record, max = MAX_REGISTERED_CLIENTS) {
  while (registeredClients.size >= max) {
    registeredClients.delete(registeredClients.keys().next().value);
  }
  registeredClients.set(clientId, record);
}

// Does the password typed on the consent page match OAUTH_APPROVAL_PASSWORD.
// This is the check that stops a stranger who registered their own client
// from approving it themselves. Fails closed: no configured password (unset or
// empty) never approves. Both sides are sha256-hashed to equal-length buffers
// before timingSafeEqual, so the comparison neither throws on a length
// mismatch nor leaks the password's length through timing.
export function isApprovalAuthorized({ submittedPassword, approvalPassword }) {
  if (typeof approvalPassword !== "string" || approvalPassword === "") return false;
  if (typeof submittedPassword !== "string" || submittedPassword === "") return false;
  const a = createHash("sha256").update(submittedPassword, "utf8").digest();
  const b = createHash("sha256").update(approvalPassword, "utf8").digest();
  return timingSafeEqual(a, b);
}

// Fixed-window in-memory rate limiter: at most `max` hits per `windowMs` per
// key. Deliberately tiny (no dependency); state is lost on restart, which is
// fine — it only has to slow down password guessing and registration spam.
// Note the key is req.ip, which behind the Apache proxy is the proxy's
// address for every caller, so in production these limits are effectively
// global — stricter against distributed guessing, at the cost of an attacker
// being able to briefly lock out the owner.
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // key → { count, resetAt }
  return {
    hit(key, now) {
      if (hits.size > 10000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= max;
    },
  };
}

// Does this client_id/client_secret pair actually authenticate — checked
// separately from isKnownClient because the token endpoint needs the secret
// to match, not just the id to be recognised.
export function matchesClientCredentials({ clientId, clientSecret, oauthClientId, oauthClientSecret, registeredClients }) {
  const staticMatch = Boolean(oauthClientId) && Boolean(oauthClientSecret) && clientId === oauthClientId && clientSecret === oauthClientSecret;
  const dynamic = registeredClients.get(clientId);
  const dynamicMatch = Boolean(dynamic) && dynamic.clientSecret === clientSecret;
  return staticMatch || dynamicMatch;
}

// Is a stored auth-code entry still redeemable for this exact client/redirect
// pair, at this instant.
export function isValidAuthCode({ entry, now, clientId, redirectUri }) {
  if (!entry) return false;
  return entry.expiresAt >= now && entry.clientId === clientId && entry.redirectUri === redirectUri;
}

// Where /oauth/authorize's POST (the consent form submission) should send
// the browser next — either back with an authorization code, or back with
// an access_denied error. Returns the destination URL as a string, or null
// if redirectUri itself doesn't parse (the caller should 400 in that case).
export function buildAuthorizeRedirect({ redirectUri, approved, code, state }) {
  let dest;
  try {
    dest = new URL(redirectUri);
  } catch {
    return null;
  }
  if (!approved) {
    dest.searchParams.set("error", "access_denied");
  } else {
    dest.searchParams.set("code", code);
  }
  if (state) dest.searchParams.set("state", state);
  return dest.toString();
}

// The bearer-token-or-x-api-key check every non-public route runs through.
// Framework-free: takes plain header values in, returns whether the request
// is authorized. The 401 body/header shape is the caller's job (see
// installOAuth2AuthorizationServer's middleware) so this stays testable
// without a mock Express response.
export function isAuthorized({ authorizationHeader, apiKeyHeader, mcpApiKey, accessTokens, now }) {
  const bearer = authorizationHeader?.match(/^Bearer (.+)$/i)?.[1];
  if (bearer) {
    const entry = accessTokens.get(bearer);
    return Boolean(entry) && entry.expiresAt > now;
  }
  return apiKeyHeader === mcpApiKey;
}

export function consentPageHtml({ serviceName, serviceDescription, baseUrl, clientId, clientName, redirectUri, state, codeChallenge, codeChallengeMethod, error, approvalEnabled = true }) {
  let redirectHost = "";
  try { redirectHost = new URL(redirectUri).host; } catch { /* validated by the caller */ }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize — ${escHtml(serviceName)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 440px; margin: 80px auto; padding: 0 20px; color: #111; }
    h1   { font-size: 1.3rem; margin-bottom: 0.25rem; }
    p    { color: #555; margin-bottom: 2rem; }
    .actions { display: flex; gap: 12px; }
    button { padding: 10px 28px; font-size: 1rem; border: none; border-radius: 6px; cursor: pointer; }
    .approve { background: #2563eb; color: #fff; }
    .deny    { background: #e5e7eb; color: #111; }
    label    { display: block; font-size: 0.9rem; margin-bottom: 0.25rem; }
    input[type=password] { width: 100%; box-sizing: border-box; padding: 8px; font-size: 1rem; margin-bottom: 1.25rem; }
    .client  { font-size: 0.9rem; margin-bottom: 1rem; }
    .error   { color: #b91c1c; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>${escHtml(serviceName)}</h1>
  <p>An application is requesting access to your ${escHtml(serviceDescription)}.</p>
  <div class="client">Client: <strong>${escHtml(clientName || "unnamed")}</strong> &rarr; sends you back to <strong>${escHtml(redirectHost)}</strong></div>
  ${error ? `<div class="error">${escHtml(error)}</div>` : ""}
  ${approvalEnabled ? "" : `<div class="error">Approval is disabled: OAUTH_APPROVAL_PASSWORD is not set on this server.</div>`}
  <form method="POST" action="${baseUrl}/oauth/authorize">
    <input type="hidden" name="client_id"             value="${escHtml(clientId)}">
    <input type="hidden" name="redirect_uri"          value="${escHtml(redirectUri)}">
    <input type="hidden" name="state"                 value="${escHtml(state)}">
    <input type="hidden" name="code_challenge"        value="${escHtml(codeChallenge)}">
    <input type="hidden" name="code_challenge_method" value="${escHtml(codeChallengeMethod)}">
    <label for="password">Approval password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required autofocus>
    <div class="actions">
      <button class="approve" name="approve" value="1">Approve</button>
      <button class="deny"    name="approve" value="0" formnovalidate>Deny</button>
    </div>
  </form>
</body>
</html>`;
}

export const OAUTH_PUBLIC_PATHS = ["/health", "/oauth/", "/.well-known/"];

// Wires the full OAuth2 authorization-server surface (metadata, dynamic
// registration, PKCE authorize/token, and the bearer-or-api-key gate) onto
// an Express app. Returns { requireAuth, accessTokens } so index.js can
// app.use(requireAuth) after mounting its own public routes and reach into
// accessTokens if it ever needs to (e.g. a future revoke endpoint).
export function installOAuth2AuthorizationServer(app, {
  serviceName,
  serviceDescription,
  baseUrl,
  mcpApiKey,
  oauthClientId,
  oauthClientSecret,
  tokenTtlHours,
  approvalPassword,
}) {
  const approvalEnabled = typeof approvalPassword === "string" && approvalPassword !== "";
  if (!approvalEnabled)
    console.warn(`WARNING: OAUTH_APPROVAL_PASSWORD is not set — ${serviceName} will refuse every OAuth consent approval (x-api-key access is unaffected).`);
  const registerLimiter  = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30 }); // per hour
  const authorizeLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }); // per 15 min

  const authCodes = new Map();         // code     → { clientId, redirectUri, codeChallenge, codeChallengeMethod (always S256), expiresAt }
  const accessTokens = new Map();      // token    → { expiresAt }
  const registeredClients = new Map(); // clientId → { clientSecret, redirectUris, clientName }

  const router = express.Router();

  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer:                            baseUrl,
      authorization_endpoint:           `${baseUrl}/oauth/authorize`,
      token_endpoint:                    `${baseUrl}/oauth/token`,
      registration_endpoint:            `${baseUrl}/oauth/register`,
      response_types_supported:         ["code"],
      grant_types_supported:            ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({ resource: baseUrl, authorization_servers: [baseUrl] });
  });

  router.post("/oauth/register", (req, res) => {
    if (!registerLimiter.hit(req.ip, Date.now()))
      return res.status(429).json({ error: "too_many_requests" });
    const { client_name } = req.body ?? {};
    const redirect_uris = normalizeRedirectUris(req.body?.redirect_uris);
    if (!redirect_uris)
      return res.status(400).json({ error: "invalid_client_metadata", error_description: `redirect_uris must be an array of 1-${MAX_REDIRECT_URIS} absolute URLs` });
    const clientName = typeof client_name === "string" ? client_name.slice(0, 100) : "";
    const clientId = generateToken();
    const clientSecret = generateToken();
    rememberClient(registeredClients, clientId, { clientSecret, redirectUris: redirect_uris, clientName });
    console.log(`OAuth client registered: ${JSON.stringify(clientName || "unnamed")} (${clientId}) redirect_uris=${JSON.stringify(redirect_uris)}`);
    res.status(201).json({ client_id: clientId, client_secret: clientSecret, redirect_uris, grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "client_secret_post" });
  });

  // Shared by GET (render the consent page) and POST (the form submission):
  // the client must be known and the redirect_uri one it registered, before
  // anything is rendered or any browser is redirected. Returns an error
  // [status, message] pair, or null if the request is acceptable.
  function rejectClientOrRedirect(clientId, redirectUri) {
    if (!isKnownClient({ clientId, oauthClientId, registeredClients })) return [401, "Unknown client_id"];
    if (!redirectUri) return [400, "Missing redirect_uri"];
    if (!isRegisteredRedirect({ clientId, redirectUri, oauthClientId, registeredClients }))
      return [400, "redirect_uri is not registered for this client"];
    return null;
  }

  function renderConsent(params, { error } = {}) {
    return consentPageHtml({
      serviceName, serviceDescription, baseUrl, approvalEnabled, error,
      clientId: params.client_id, clientName: registeredClients.get(params.client_id)?.clientName,
      redirectUri: params.redirect_uri, state: params.state,
      codeChallenge: params.code_challenge, codeChallengeMethod: params.code_challenge_method,
    });
  }

  router.get("/oauth/authorize", (req, res) => {
    const { client_id, redirect_uri, response_type } = req.query;
    if (response_type !== "code") return res.status(400).send("Unsupported response_type");
    const rejection = rejectClientOrRedirect(client_id, redirect_uri);
    if (rejection) return res.status(rejection[0]).send(rejection[1]);
    if (!isValidPKCEChallenge({ codeChallenge: req.query.code_challenge, codeChallengeMethod: req.query.code_challenge_method }))
      return res.status(400).send("PKCE required: code_challenge with code_challenge_method=S256");
    res.set("X-Frame-Options", "DENY").set("Content-Security-Policy", "frame-ancestors 'none'");
    res.send(renderConsent(req.query));
  });

  router.post("/oauth/authorize", (req, res) => {
    const body = req.body ?? {};
    res.set("X-Frame-Options", "DENY").set("Content-Security-Policy", "frame-ancestors 'none'");
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, approve, password } = body;
    const rejection = rejectClientOrRedirect(client_id, redirect_uri);
    if (rejection) return res.status(rejection[0]).send(rejection[1]);
    if (!isValidPKCEChallenge({ codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method }))
      return res.status(400).send("PKCE required: code_challenge with code_challenge_method=S256");
    const approved = approve === "1";
    const audit = outcome => formatApprovalLog({
      outcome, clientId: client_id, clientName: registeredClients.get(client_id)?.clientName,
      redirectUri: redirect_uri, ip: req.ip, forwardedFor: req.headers["x-forwarded-for"],
    });
    let code;
    if (approved) {
      if (!authorizeLimiter.hit(req.ip, Date.now())) {
        console.warn(audit("REFUSED (rate limited)"));
        return res.status(429).send(renderConsent(body, { error: "Too many attempts — wait 15 minutes and try again." }));
      }
      if (!isApprovalAuthorized({ submittedPassword: password, approvalPassword })) {
        console.warn(audit(approvalEnabled ? "REFUSED (wrong password)" : "REFUSED (OAUTH_APPROVAL_PASSWORD not set)"));
        return res.status(403).send(renderConsent(body, { error: approvalEnabled ? "Wrong approval password." : "Approval is disabled on this server." }));
      }
      console.log(audit("GRANTED"));
      code = generateToken();
      authCodes.set(code, { clientId: client_id, redirectUri: redirect_uri, codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method, expiresAt: Date.now() + 10 * 60 * 1000 });
    }
    const dest = buildAuthorizeRedirect({ redirectUri: redirect_uri, approved, code, state });
    if (dest === null) return res.status(400).send("Invalid redirect_uri");
    res.redirect(dest);
  });

  router.post("/oauth/token", (req, res) => {
    const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = req.body ?? {};
    if (grant_type !== "authorization_code")
      return res.status(400).json({ error: "unsupported_grant_type" });
    if (!matchesClientCredentials({ clientId: client_id, clientSecret: client_secret, oauthClientId, oauthClientSecret, registeredClients }))
      return res.status(401).json({ error: "invalid_client" });
    const entry = authCodes.get(code);
    if (!isValidAuthCode({ entry, now: Date.now(), clientId: client_id, redirectUri: redirect_uri }))
      return res.status(400).json({ error: "invalid_grant" });
    if (!verifyPKCE(code_verifier, entry.codeChallenge, entry.codeChallengeMethod))
      return res.status(400).json({ error: "invalid_grant" });
    authCodes.delete(code);
    const token = generateToken();
    accessTokens.set(token, { expiresAt: Date.now() + tokenTtlHours * 60 * 60 * 1000 });
    res.json({ access_token: token, token_type: "Bearer", expires_in: tokenTtlHours * 3600 });
  });

  app.use(router);

  function requireAuth(req, res, next) {
    if (OAUTH_PUBLIC_PATHS.some(p => req.path.startsWith(p))) return next();
    if (isAuthorized({
      authorizationHeader: req.headers.authorization,
      apiKeyHeader: req.headers["x-api-key"],
      mcpApiKey, accessTokens, now: Date.now(),
    })) return next();
    return res.status(401).set("WWW-Authenticate", `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`).json({ error: "Unauthorized" });
  }

  return { requireAuth, accessTokens };
}
