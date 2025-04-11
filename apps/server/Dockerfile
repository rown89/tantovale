FROM node:22-slim AS base

RUN npm install -g pnpm

FROM base AS builder

RUN apk add --no-cache gcompat

WORKDIR /app

COPY package*json tsconfig.json / ./
RUN pnpm install --frozen-lockfile && \
    pnpm run build && \
    pnpm prune --prod

FROM base AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

# Copy only what's needed to run the application
COPY --from=installer --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=hono:nodejs /app/apps/server/dist ./apps/server/dist
COPY --from=installer --chown=hono:nodejs /app/apps/server/package.json ./apps/server/package.json

USER hono
EXPOSE 3000

CMD ["node", "apps/server/dist/src/index.js"]