#!/usr/bin/env bash
# Smoke-test a built meal-planner image: it starts, reports healthy, keeps
# the MCP endpoint behind auth, hides error details, serves a tool call, and
# keeps the MCP and viewer listeners apart.
# Usage: scripts/smoke-image.sh <image> [platform]
set -euo pipefail

image="${1:?usage: smoke-image.sh <image> [platform]}"
platform="${2:-}"
name="meal-planner-smoke-$$"
key="$(openssl rand -hex 32)"
port=39123
viewer_port=39124

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" ${platform:+--platform "$platform"} \
  -p "127.0.0.1:$port:3000" -p "127.0.0.1:$viewer_port:3001" -e MCP_API_KEY="$key" "$image" >/dev/null

base="http://127.0.0.1:$port"
for _ in $(seq 120); do
  curl -sf "$base/health" >/dev/null && break
  sleep 1
done

fail() { echo "FAIL: $*" >&2; docker logs "$name" >&2 || true; exit 1; }
mcp() {
  curl -s "$base/mcp" -H "x-api-key: $key" -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' "$@"
}

[ "$(curl -s "$base/health")" = '{"status":"ok","service":"meal-planner"}' ] ||
  fail "/health"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/mcp")" = 401 ] ||
  fail "/mcp without credentials should be 401"
[ "$(mcp -d '{bad')" = '{"error":"Bad request"}' ] ||
  fail "malformed JSON should return a generic error"
mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_weeks","arguments":{}}}' |
  grep -q '2026-10-12' || fail "list_weeks should return the seeded weeks"
viewer="http://127.0.0.1:$viewer_port"
curl -s "$viewer/week/2026-10-12" | grep -q 'Thomas at Kita' ||
  fail "viewer should render the seeded week"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$base/week/2026-10-12")" = 404 ] ||
  fail "MCP listener must not serve viewer pages"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$viewer/mcp")" = 404 ] ||
  fail "viewer listener must not serve /mcp"
[ "$(docker exec "$name" id -un)" = node ] || fail "should run as the node user"

for _ in $(seq 90); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$name")"
  [ "$status" = healthy ] && break
  sleep 1
done
[ "$status" = healthy ] || fail "HEALTHCHECK status is $status"

echo "smoke test passed: $image ${platform}"
