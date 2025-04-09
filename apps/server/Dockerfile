FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

FROM base AS builder

RUN apk update
RUN apk add --no-cache libc6-compat bash curl
# Set working directory
WORKDIR /app

# Install turbo globally
RUN pnpm install -g turbo
COPY . .
RUN turbo prune @workspace/server --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer

RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY --from=builder /app/out/json/ .
# Use --no-frozen-lockfile to ensure pnpm can resolve workspace dependencies properly
RUN pnpm install --no-frozen-lockfile

# Build the project
COPY --from=builder /app/out/full/ .

# Build the server and its dependencies
RUN pnpm turbo build --filter=@workspace/server

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono
USER hono

# Copy only what's needed to run the application
COPY --from=installer --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=hono:nodejs /app/apps/server/dist ./apps/server/dist
COPY --from=installer --chown=hono:nodejs /app/apps/server/package.json ./apps/server/package.json
# Copy the database package.json
COPY --from=installer --chown=hono:nodejs /app/packages/database/package.json ./packages/database/package.json

EXPOSE 4000

CMD ["node", "apps/server/dist/index.js"]