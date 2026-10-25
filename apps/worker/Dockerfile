# Base image with Bun
FROM ghcr.io/yeusepe/coolify@sha256:fc0055a6177e7c46d79b1670be1992a8b1da9f477dda33e4f7be40807eafa2a2 AS base

# Install turbo CLI globally
FROM base AS turbo-cli
RUN bun add -g turbo

# Builder stage - prune worker workspace
FROM turbo-cli AS builder
WORKDIR /app
COPY . .
RUN test -f .git-commit-sha || printf 'unknown' > .git-commit-sha
RUN bun scripts/prune-docker.ts @midday/worker out/worker

# Installer stage - install deps and build
FROM base AS installer
WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json files from worker pruned workspace
COPY --from=builder /app/out/worker/json/ .
COPY bunfig.toml .
COPY patches ./patches

# Install production dependencies before copying full source to maximize cache hits.
RUN rm -f bun.lock
RUN bun install

# Copy full source from worker pruned workspace
COPY --from=builder /app/out/worker/full/ .
RUN cd packages/workbench && bun run build:ui && bun run build:lib
RUN bun prune --production

# Runner stage - clean image
FROM ghcr.io/yeusepe/coolify@sha256:fc0055a6177e7c46d79b1670be1992a8b1da9f477dda33e4f7be40807eafa2a2 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy workspace from installer
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/worker ./apps/worker
COPY --from=installer /app/packages ./packages
COPY --from=installer /app/package.json ./package.json

# Carry the git SHA into the runtime container (stamped by CI before `railway up`)
COPY --from=builder /app/.git-commit-sha /tmp/git-sha.txt
COPY --from=builder /app/scripts/docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app/apps/worker

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s CMD bun -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "src/index.ts"]
