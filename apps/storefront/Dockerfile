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
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY packages/ ./packages/

# Copy remaining files needed for the build
COPY . .

RUN turbo prune @workspace/storefront --docker

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

RUN pnpm turbo build --filter=@workspace/storefront

FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/storefront/public ./apps/storefront/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/next.config.js ./apps/storefront/next.config.js

CMD node apps/storefront/server.js