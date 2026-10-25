# Base image with Bun
FROM ghcr.io/yeusepe/coolify@sha256:fc0055a6177e7c46d79b1670be1992a8b1da9f477dda33e4f7be40807eafa2a2 AS base

# Install turbo CLI globally
FROM base AS turbo-cli
RUN bun add -g turbo

# Builder stage - prune API workspace
FROM turbo-cli AS builder
WORKDIR /app
COPY . .
RUN bun scripts/prune-docker.ts @midday/api

# Installer stage - install deps and build
FROM base AS installer
WORKDIR /app

# Install dependencies
COPY --from=builder /app/out/json/ .
COPY bunfig.toml .
COPY patches ./patches
RUN bun install

# Copy full source
COPY --from=builder /app/out/full/ .

# Build the mcp-apps package (produces self-contained HTML files)
RUN cd packages/mcp-apps && bun run build
# The production install supplies its own workspace dependency directories.
RUN find packages apps/api -type d -name node_modules -prune -exec rm -rf '{}' +

# Production dependency stage - keep build-only packages out of runtime
FROM base AS prod-deps
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY bunfig.toml .
COPY patches ./patches
# Turbo may keep this workspace in the pruned install set even when the API
# runtime does not import it. Make it dependency-free for production deps.
RUN printf '%s\n' '{"name":"@midday/ui","private":true,"exports":{}}' > packages/ui/package.json
# Email rendering does not need the react-email dev server or shared UI package
# in the API runtime image.
RUN printf '%s\n' '{"name":"@midday/email","version":"1.0.0","private":true,"main":"index.ts","exports":{"./emails/*":"./emails/*.tsx","./defaults":"./defaults.ts","./locales":"./locales/index.ts","./render":"./render.ts"},"dependencies":{"@midday/utils":"workspace:*","@react-email/components":"1.0.10","@react-email/render":"2.0.4","@react-email/tailwind":"2.0.6","date-fns":"^4.1.0","react":"19.3.1","react-dom":"19.3.1","responsive-react-email":"^0.0.5"}}' > packages/email/package.json
# The API uses only the invoice PDF/default utility modules in production.
# Avoid installing the invoice HTML/editor UI dependency tree into the runtime.
RUN printf '%s\n' '{"name":"@midday/invoice","private":true,"main":"src/index.tsx","exports":{".":"./src/index.tsx","./token":"./src/token/index.ts","./number":"./src/utils/number.ts","./templates/pdf":"./src/templates/pdf/index.tsx","./defaults":"./src/defaults.ts","./calculate":"./src/utils/calculate.ts","./content":"./src/utils/content.ts","./types":"./src/types.ts","./utils":"./src/utils/transform.ts","./currency":"./src/utils/currency.ts","./recurring":"./src/utils/recurring.ts"},"dependencies":{"@midday/utils":"workspace:*","@react-pdf/renderer":"^4.3.2","date-fns":"^4.1.0","jose":"^6.2.2","qrcode":"^1.5.4","react":"19.3.1"}}' > packages/invoice/package.json
# The API reads only @midday/mcp-apps/dist at runtime. Keep the real package
# for the build stage, but prevent its UI/build dependency graph from being
# installed into the API runtime image.
RUN printf '%s\n' '{"name":"@midday/mcp-apps","version":"1.0.0","private":true,"exports":{"./dist/*":"./dist/*","./package.json":"./package.json"}}' > packages/mcp-apps/package.json
RUN rm -f bun.lock && bun install --production --no-save

# Runner stage - clean image
FROM ghcr.io/yeusepe/coolify@sha256:fc0055a6177e7c46d79b1670be1992a8b1da9f477dda33e4f7be40807eafa2a2 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy only what's needed at runtime
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=installer /app/apps/api ./apps/api
COPY --from=installer /app/packages ./packages
COPY --from=prod-deps /app/apps/api ./apps/api
COPY --from=prod-deps /app/packages ./packages
COPY --from=installer /app/package.json ./package.json

# Carry the git SHA into the runtime container when the platform provides it.
ARG GIT_COMMIT_SHA=unknown
RUN printf "%s" "$GIT_COMMIT_SHA" > /tmp/git-sha.txt
COPY --from=builder /app/scripts/docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app/apps/api

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s CMD bun -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "src/index.ts"]
