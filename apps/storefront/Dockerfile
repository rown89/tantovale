# Use official Node.js alpine image as base
FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat bash curl && \
    curl -fsSL https://get.pnpm.io/v6.16.js | node - add --global pnpm

# Build stage
FROM base AS builder
WORKDIR /app

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN pnpm add -g turbo

# Copy only necessary files for dependency installation
COPY pnpm-lock.yaml .
COPY package.json .
COPY turbo.json .
COPY apps/storefront/package.json ./apps/storefront/

# Install dependencies with caching
RUN pnpm fetch
COPY . .
RUN pnpm install --offline

# Build the application
RUN npx turbo run build:next --filter=@tantovale/storefront

# Production stage
FROM base AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only necessary files for runtime
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/package.json ./

COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/next.config.js ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/static ./.next/static

# Set user and runtime configurations
USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME 0.0.0.0

# Updated CMD to match standalone build
CMD ["node", "apps/storefront/server.js"]