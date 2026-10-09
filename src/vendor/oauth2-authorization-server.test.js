import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import {
  generateToken,
  verifyPKCE,
  escHtml,
  isKnownClient,
  matchesClientCredentials,
  isValidAuthCode,
  buildAuthorizeRedirect,
  isAuthorized,
  isRegisteredRedirect,
  normalizeRedirectUris,
  rememberClient,
  isApprovalAuthorized,
  createRateLimiter,
  consentPageHtml,
  MAX_REDIRECT_URIS,
  isAllowedRedirectUrl,
  isValidPKCEChallenge,
  formatApprovalLog,
} from "./oauth2-authorization-server.js";

test("generateToken", async (t) => {
  await t.test("returns a 64-char hex string", () => {
    const token = generateToken();
    assert.equal(token.length, 64);
    assert.match(token, /^[0-9a-f]+$/);
  });

  await t.test("two calls never collide in practice", () => {
    assert.notEqual(generateToken(), generateToken());
  });
});

test("verifyPKCE", async (t) => {
  await t.test("S256 matches the sha256/base64url digest of the verifier", () => {
    const verifier = "a-random-verifier-string";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    assert.equal(verifyPKCE(verifier, challenge, "S256"), true);
  });

  await t.test("S256 rejects a verifier that doesn't hash to the challenge", () => {
    assert.equal(verifyPKCE("wrong-verifier", "some-challenge", "S256"), false);
  });

  await t.test("non-string verifier/challenge (e.g. a repeated form field) is rejected, not thrown on", () => {
    assert.equal(verifyPKCE(["a", "b"], "c", "S256"), false);
    assert.equal(verifyPKCE(undefined, "c", "S256"), false);
    assert.equal(verifyPKCE("a", { x: 1 }, "plain"), false);
  });

  await t.test("plain method compares the verifier and challenge directly", () => {
    assert.equal(verifyPKCE("same-value", "same-value", "plain"), true);
    assert.equal(verifyPKCE("a", "b", "plain"), false);
  });
});

test("escHtml", async (t) => {
  await t.test("escapes the 4 characters that matter for an attribute value", () => {
    assert.equal(escHtml(`<script>"&"</script>`), "&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;");
  });

  await t.test("treats null/undefined as an empty string rather than throwing", () => {
    assert.equal(escHtml(null), "");
    assert.equal(escHtml(undefined), "");
  });
});

test("isKnownClient", async (t) => {
  await t.test("recognises the configured static client", () => {
    assert.equal(isKnownClient({ clientId: "static-1", oauthClientId: "static-1", registeredClients: new Map() }), true);
  });

  await t.test("recognises a dynamically-registered client", () => {
    const registeredClients = new Map([["dyn-1", { clientSecret: "s", redirectUris: [] }]]);
    assert.equal(isKnownClient({ clientId: "dyn-1", oauthClientId: undefined, registeredClients }), true);
  });

  await t.test("rejects an unknown client_id", () => {
    assert.equal(isKnownClient({ clientId: "nope", oauthClientId: "static-1", registeredClients: new Map() }), false);
  });

  await t.test("no static client configured never matches an empty client_id by accident", () => {
    // Regression guard: oauthClientId undefined must not compare truthily against clientId undefined.
    assert.equal(isKnownClient({ clientId: undefined, oauthClientId: undefined, registeredClients: new Map() }), false);
  });
});

test("matchesClientCredentials", async (t) => {
  await t.test("the static client matches on id + secret", () => {
    assert.equal(matchesClientCredentials({
      clientId: "static-1", clientSecret: "shh",
      oauthClientId: "static-1", oauthClientSecret: "shh",
      registeredClients: new Map(),
    }), true);
  });

  await t.test("the static client's id alone is not enough without the right secret", () => {
    assert.equal(matchesClientCredentials({
      clientId: "static-1", clientSecret: "wrong",
      oauthClientId: "static-1", oauthClientSecret: "shh",
      registeredClients: new Map(),
    }), false);
  });

  await t.test("a static client with no secret configured never matches (fails closed)", () => {
    assert.equal(matchesClientCredentials({
      clientId: "static-1", clientSecret: undefined,
      oauthClientId: "static-1", oauthClientSecret: undefined,
      registeredClients: new Map(),
    }), false);
  });

  await t.test("a dynamically-registered client matches on its own secret", () => {
    const registeredClients = new Map([["dyn-1", { clientSecret: "dyn-secret", redirectUris: [] }]]);
    assert.equal(matchesClientCredentials({
      clientId: "dyn-1", clientSecret: "dyn-secret",
      oauthClientId: undefined, oauthClientSecret: undefined,
      registeredClients,
    }), true);
  });

  await t.test("a dynamically-registered client's wrong secret is rejected", () => {
    const registeredClients = new Map([["dyn-1", { clientSecret: "dyn-secret", redirectUris: [] }]]);
    assert.equal(matchesClientCredentials({
      clientId: "dyn-1", clientSecret: "guessed",
      oauthClientId: undefined, oauthClientSecret: undefined,
      registeredClients,
    }), false);
  });
});

test("isValidAuthCode", async (t) => {
  const now = Date.now();

  await t.test("a fresh, matching code is valid", () => {
    const entry = { clientId: "c1", redirectUri: "https://a/cb", expiresAt: now + 1000 };
    assert.equal(isValidAuthCode({ entry, now, clientId: "c1", redirectUri: "https://a/cb" }), true);
  });

  await t.test("a missing entry (unknown/already-redeemed code) is invalid", () => {
    assert.equal(isValidAuthCode({ entry: undefined, now, clientId: "c1", redirectUri: "https://a/cb" }), false);
  });

  await t.test("an expired entry is invalid even if everything else matches", () => {
    const entry = { clientId: "c1", redirectUri: "https://a/cb", expiresAt: now - 1 };
    assert.equal(isValidAuthCode({ entry, now, clientId: "c1", redirectUri: "https://a/cb" }), false);
  });

  await t.test("a code issued to a different client is invalid — prevents code theft/replay across clients", () => {
    const entry = { clientId: "c1", redirectUri: "https://a/cb", expiresAt: now + 1000 };
    assert.equal(isValidAuthCode({ entry, now, clientId: "attacker", redirectUri: "https://a/cb" }), false);
  });

  await t.test("a mismatched redirect_uri is invalid", () => {
    const entry = { clientId: "c1", redirectUri: "https://a/cb", expiresAt: now + 1000 };
    assert.equal(isValidAuthCode({ entry, now, clientId: "c1", redirectUri: "https://evil/cb" }), false);
  });
});

test("buildAuthorizeRedirect", async (t) => {
  await t.test("approval carries the code (and state, if present) back to the client", () => {
    const url = buildAuthorizeRedirect({ redirectUri: "https://app.example/cb", approved: true, code: "abc123", state: "xyz" });
    assert.equal(url, "https://app.example/cb?code=abc123&state=xyz");
  });

  await t.test("denial carries an access_denied error instead of a code", () => {
    const url = buildAuthorizeRedirect({ redirectUri: "https://app.example/cb", approved: false, code: undefined, state: "xyz" });
    assert.equal(url, "https://app.example/cb?error=access_denied&state=xyz");
  });

  await t.test("state is omitted from the query string when absent", () => {
    const url = buildAuthorizeRedirect({ redirectUri: "https://app.example/cb", approved: true, code: "abc123", state: undefined });
    assert.equal(url, "https://app.example/cb?code=abc123");
  });

  await t.test("an unparseable redirect_uri returns null rather than throwing", () => {
    assert.equal(buildAuthorizeRedirect({ redirectUri: "not a url", approved: true, code: "abc123" }), null);
  });
});

test("isAuthorized", async (t) => {
  const now = Date.now();

  await t.test("a live bearer token is authorized", () => {
    const accessTokens = new Map([["tok", { expiresAt: now + 1000 }]]);
    assert.equal(isAuthorized({ authorizationHeader: "Bearer tok", apiKeyHeader: undefined, mcpApiKey: "k", accessTokens, now }), true);
  });

  await t.test("an expired bearer token is not authorized, even with the right x-api-key absent check bypassed", () => {
    const accessTokens = new Map([["tok", { expiresAt: now - 1 }]]);
    assert.equal(isAuthorized({ authorizationHeader: "Bearer tok", apiKeyHeader: undefined, mcpApiKey: "k", accessTokens, now }), false);
  });

  await t.test("an unknown bearer token is not authorized", () => {
    assert.equal(isAuthorized({ authorizationHeader: "Bearer nope", apiKeyHeader: undefined, mcpApiKey: "k", accessTokens: new Map(), now }), false);
  });

  await t.test("the correct x-api-key is authorized when no bearer header is sent", () => {
    assert.equal(isAuthorized({ authorizationHeader: undefined, apiKeyHeader: "k", mcpApiKey: "k", accessTokens: new Map(), now }), true);
  });

  await t.test("the wrong x-api-key is not authorized", () => {
    assert.equal(isAuthorized({ authorizationHeader: undefined, apiKeyHeader: "wrong", mcpApiKey: "k", accessTokens: new Map(), now }), false);
  });

  await t.test("no credentials at all is not authorized", () => {
    assert.equal(isAuthorized({ authorizationHeader: undefined, apiKeyHeader: undefined, mcpApiKey: "k", accessTokens: new Map(), now }), false);
  });
});

test("isApprovalAuthorized", async (t) => {
  await t.test("the correct password approves", () => {
    assert.equal(isApprovalAuthorized({ submittedPassword: "correct horse", approvalPassword: "correct horse" }), true);
  });

  await t.test("a wrong password does not approve", () => {
    assert.equal(isApprovalAuthorized({ submittedPassword: "wrong", approvalPassword: "correct horse" }), false);
  });

  await t.test("a missing or empty submitted password does not approve", () => {
    assert.equal(isApprovalAuthorized({ submittedPassword: undefined, approvalPassword: "pw" }), false);
    assert.equal(isApprovalAuthorized({ submittedPassword: "", approvalPassword: "pw" }), false);
  });

  await t.test("a non-string submitted password (e.g. a repeated form field → array) does not approve", () => {
    assert.equal(isApprovalAuthorized({ submittedPassword: ["pw", "pw"], approvalPassword: "pw" }), false);
  });

  await t.test("fails closed: no configured approvalPassword never approves, whatever is submitted", () => {
    for (const approvalPassword of [undefined, null, ""]) {
      for (const submittedPassword of [undefined, "", "anything", "undefined"]) {
        assert.equal(isApprovalAuthorized({ submittedPassword, approvalPassword }), false);
      }
    }
  });

  await t.test("different lengths are compared without throwing (timingSafeEqual needs equal lengths)", () => {
    assert.doesNotThrow(() => isApprovalAuthorized({ submittedPassword: "a", approvalPassword: "a much longer password" }));
    assert.equal(isApprovalAuthorized({ submittedPassword: "a", approvalPassword: "a much longer password" }), false);
    assert.equal(isApprovalAuthorized({ submittedPassword: "x".repeat(10000), approvalPassword: "short" }), false);
  });

  await t.test("a prefix of the password does not approve", () => {
    assert.equal(isApprovalAuthorized({ submittedPassword: "correct", approvalPassword: "correct horse" }), false);
  });
});

test("isRegisteredRedirect", async (t) => {
  const registeredClients = new Map([["dyn-1", { clientSecret: "s", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] }]]);

  await t.test("a dynamic client's exact registered redirect is accepted", () => {
    assert.equal(isRegisteredRedirect({ clientId: "dyn-1", redirectUri: "https://claude.ai/api/mcp/auth_callback", oauthClientId: undefined, registeredClients }), true);
  });

  await t.test("a dynamic client's unregistered redirect is rejected", () => {
    assert.equal(isRegisteredRedirect({ clientId: "dyn-1", redirectUri: "https://evil.example/cb", oauthClientId: undefined, registeredClients }), false);
  });

  await t.test("prefix/extension of a registered redirect is rejected (exact match only)", () => {
    assert.equal(isRegisteredRedirect({ clientId: "dyn-1", redirectUri: "https://claude.ai/api/mcp/auth_callback.evil.example", oauthClientId: undefined, registeredClients }), false);
    assert.equal(isRegisteredRedirect({ clientId: "dyn-1", redirectUri: "https://claude.ai/api/mcp/auth_callback?x=1", oauthClientId: undefined, registeredClients }), false);
  });

  await t.test("an unknown client is rejected", () => {
    assert.equal(isRegisteredRedirect({ clientId: "nope", redirectUri: "https://claude.ai/api/mcp/auth_callback", oauthClientId: "static-1", registeredClients }), false);
  });

  await t.test("missing or non-string redirect_uri is rejected", () => {
    assert.equal(isRegisteredRedirect({ clientId: "dyn-1", redirectUri: undefined, oauthClientId: undefined, registeredClients }), false);
    assert.equal(isRegisteredRedirect({ clientId: "dyn-1", redirectUri: ["https://claude.ai/api/mcp/auth_callback"], oauthClientId: undefined, registeredClients }), false);
  });

  await t.test("the static client (no registered list) accepts any allowed redirect URL, but not garbage", () => {
    assert.equal(isRegisteredRedirect({ clientId: "static-1", redirectUri: "https://claude.ai/api/mcp/auth_callback", oauthClientId: "static-1", registeredClients }), true);
    assert.equal(isRegisteredRedirect({ clientId: "static-1", redirectUri: "not a url", oauthClientId: "static-1", registeredClients }), false);
    assert.equal(isRegisteredRedirect({ clientId: "static-1", redirectUri: "http://evil.example/cb", oauthClientId: "static-1", registeredClients }), false);
  });

  await t.test("no static client configured never matches an undefined client_id", () => {
    assert.equal(isRegisteredRedirect({ clientId: undefined, redirectUri: "https://a/cb", oauthClientId: undefined, registeredClients }), false);
  });
});

test("isAllowedRedirectUrl", async (t) => {
  await t.test("https anywhere and loopback http are allowed", () => {
    for (const u of ["https://claude.ai/api/mcp/auth_callback", "http://localhost:33418/callback", "http://127.0.0.1:9/cb", "http://[::1]:9/cb"])
      assert.equal(isAllowedRedirectUrl(u), true, u);
  });

  await t.test("plain http to a remote host, script/data schemes and garbage are rejected", () => {
    for (const u of ["http://evil.example/cb", "http://localhost.evil.example/cb", "javascript:alert(1)", "data:text/html,x", "not a url", undefined])
      assert.equal(isAllowedRedirectUrl(u), false, String(u));
  });
});

test("normalizeRedirectUris", async (t) => {
  await t.test("accepts an array of absolute URLs", () => {
    assert.deepEqual(normalizeRedirectUris(["https://a/cb", "http://localhost:1234/cb"]), ["https://a/cb", "http://localhost:1234/cb"]);
  });

  await t.test("rejects a bare string (which would substring-match via .includes)", () => {
    assert.equal(normalizeRedirectUris("https://a/cb"), null);
  });

  await t.test("rejects missing, empty, oversized or non-URL lists", () => {
    assert.equal(normalizeRedirectUris(undefined), null);
    assert.equal(normalizeRedirectUris([]), null);
    assert.equal(normalizeRedirectUris(Array(MAX_REDIRECT_URIS + 1).fill("https://a/cb")), null);
    assert.equal(normalizeRedirectUris(["not a url"]), null);
    assert.equal(normalizeRedirectUris(["http://evil.example/cb"]), null);
    assert.equal(normalizeRedirectUris([42]), null);
    assert.equal(normalizeRedirectUris(["https://a/" + "x".repeat(3000)]), null);
  });
});

test("rememberClient", async (t) => {
  await t.test("evicts the oldest registration once the cap is reached", () => {
    const clients = new Map();
    for (let i = 0; i < 5; i++) rememberClient(clients, `c${i}`, { i }, 3);
    assert.equal(clients.size, 3);
    assert.deepEqual([...clients.keys()], ["c2", "c3", "c4"]);
  });
});

test("createRateLimiter", async (t) => {
  await t.test("allows max hits per window per key, then blocks until the window resets", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    assert.equal(limiter.hit("ip", 0), true);
    assert.equal(limiter.hit("ip", 10), true);
    assert.equal(limiter.hit("ip", 20), false);
    assert.equal(limiter.hit("other", 20), true, "keys are independent");
    assert.equal(limiter.hit("ip", 1000), true, "a new window starts after windowMs");
  });
});

test("consentPageHtml", async (t) => {
  const base = { serviceName: "x-mcp", serviceDescription: "x", baseUrl: "https://h/x", clientId: "c", redirectUri: "https://claude.ai/cb", state: "s" };

  await t.test("asks for the approval password", () => {
    assert.match(consentPageHtml(base), /<input type="password"[^>]*name="password"/);
  });

  await t.test("shows an escaped error and the redirect host", () => {
    const html = consentPageHtml({ ...base, error: "<b>bad</b>", clientName: "<i>n</i>" });
    assert.match(html, /&lt;b&gt;bad&lt;\/b&gt;/);
    assert.match(html, /&lt;i&gt;n&lt;\/i&gt;/);
    assert.match(html, /claude\.ai/);
  });

  await t.test("says approval is disabled when no password is configured", () => {
    assert.match(consentPageHtml({ ...base, approvalEnabled: false }), /OAUTH_APPROVAL_PASSWORD is not set/);
  });
});

test("isValidPKCEChallenge", async (t) => {
  const challenge = createHash("sha256").update("a-random-verifier-string").digest("base64url");

  await t.test("a real S256 challenge is accepted", () => {
    assert.equal(challenge.length, 43);
    assert.equal(isValidPKCEChallenge({ codeChallenge: challenge, codeChallengeMethod: "S256" }), true);
  });

  await t.test("a missing challenge or method is refused (PKCE is mandatory)", () => {
    assert.equal(isValidPKCEChallenge({ codeChallenge: undefined, codeChallengeMethod: undefined }), false);
    assert.equal(isValidPKCEChallenge({ codeChallenge: challenge, codeChallengeMethod: undefined }), false);
    assert.equal(isValidPKCEChallenge({ codeChallenge: undefined, codeChallengeMethod: "S256" }), false);
  });

  await t.test("the plain method is refused", () => {
    assert.equal(isValidPKCEChallenge({ codeChallenge: challenge, codeChallengeMethod: "plain" }), false);
  });

  await t.test("a malformed challenge (wrong length, bad chars, non-string) is refused", () => {
    assert.equal(isValidPKCEChallenge({ codeChallenge: challenge.slice(1), codeChallengeMethod: "S256" }), false);
    assert.equal(isValidPKCEChallenge({ codeChallenge: challenge.slice(1) + "+", codeChallengeMethod: "S256" }), false);
    assert.equal(isValidPKCEChallenge({ codeChallenge: [challenge], codeChallengeMethod: "S256" }), false);
  });
});

test("formatApprovalLog", async (t) => {
  await t.test("records outcome, client, redirect and both addresses", () => {
    const line = formatApprovalLog({ outcome: "GRANTED", clientId: "c1", clientName: "Claude", redirectUri: "https://claude.ai/cb", ip: "172.17.0.1", forwardedFor: "203.0.113.9" });
    assert.equal(line, 'OAuth approval GRANTED: client="Claude" (c1) redirect_uri="https://claude.ai/cb" ip=172.17.0.1 x-forwarded-for="203.0.113.9"');
  });

  await t.test("JSON-quotes client-supplied values so a newline can't forge a second log line", () => {
    const line = formatApprovalLog({ outcome: "GRANTED", clientId: "c1", clientName: "x\nOAuth approval GRANTED: fake", redirectUri: "https://a/cb", ip: "1.2.3.4", forwardedFor: undefined });
    assert.equal(line.includes("\n"), false);
    assert.match(line, /x-forwarded-for=""$/);
  });

  await t.test("an unnamed client is labelled as such", () => {
    assert.match(formatApprovalLog({ outcome: "REFUSED (wrong password)", clientId: "c1", clientName: undefined, redirectUri: "https://a/cb", ip: "1.2.3.4" }), /client="unnamed"/);
  });
});
