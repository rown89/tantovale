# Use official Node.js alpine image as base
FROM node:18-alpine AS base

# Install necessary system dependencies
RUN apk add --no-cache libc6-compat bash curl

# Build stage
FROM base AS builder
WORKDIR /app

# Install turbo globally
RUN npm install -g turbo

# Copy only necessary files for dependency installation
COPY package-lock.json .
COPY package.json .
COPY turbo.json .
COPY apps/storefront/package.json ./apps/storefront/

# Install dependencies
RUN npm ci

# Build the application
COPY . .
RUN npx turbo run build:next --filter=@workspace/storefront

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
