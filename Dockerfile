# Meal Planner: MCP server (and, from add-week-viewer, the phone viewer).
# Built for linux/arm64 (the Pi) by .github/workflows/build.yml.

# Install production dependencies only. better-sqlite3 ships prebuilt binaries
# for every platform in its package (prebuilds/linux-arm64.node is the Pi's),
# but npm would still try `node-gyp rebuild` because a binding.gyp is present,
# and the slim image has no compiler. No runtime dependency needs an install
# script, so skip them all.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    VIEWER_PORT=3001 \
    MEALS_DB=/data/meals.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# package.json is read at runtime for the server's reported version.
COPY package.json ./
COPY src ./src
# The database lives on a volume owned by the unprivileged node user (uid 1000).
RUN mkdir -p /data && chown node:node /data
USER node
# 3000: MCP (Apache). 3001: viewer (entra-auth-proxy sidecar only).
EXPOSE 3000 3001
# The slim image has no curl or wget; use Node's fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "src/index.js"]
