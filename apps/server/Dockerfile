FROM node:22-alpine AS base

# Install pnpm directly via npm (more reliable for Railway)
RUN npm install -g pnpm@10.10.0

# Setup pnpm environment for global packages
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN mkdir -p $PNPM_HOME

FROM base AS builder

RUN apk update
RUN apk add --no-cache libc6-compat bash curl
# Set working directory
WORKDIR /app

# Install turbo globally
RUN pnpm install -g turbo

# Copy workspace configuration files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/ ./packages/

# Copy remaining files needed for the build
COPY . .

RUN turbo prune @workspace/server --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

# First install the dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
# Install with Railway-optimized settings
RUN pnpm install --no-frozen-lockfile --prefer-offline

# Build the project
COPY --from=builder /app/out/full/ .

RUN pnpm turbo build --filter=@workspace/server

FROM base AS runner

WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

# Copy only what's needed to run the application
COPY --from=installer --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=hono:nodejs /app/apps/server/dist ./apps/server/dist
COPY --from=installer --chown=hono:nodejs /app/apps/server/package.json ./apps/server/package.json

USER hono

CMD ["node", "apps/server/dist/src/index.js"]