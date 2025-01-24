# Base stage: Use official Node.js alpine image
FROM node:23-alpine AS base

# Install necessary system dependencies
RUN apk add --no-cache libc6-compat bash curl

# Install pnpm globally using npm
RUN npm install -g pnpm

# Build stage
FROM base AS builder
WORKDIR /app

# Set environment variables for pnpm and PATH
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Install turbo globally
RUN pnpm add -g turbo

# Copy essential files for dependency installation
COPY pnpm-lock.yaml .
COPY package.json .
COPY turbo.json .
COPY apps/server/package.json ./apps/server/

# Fetch and install dependencies with caching
RUN pnpm fetch
COPY . .
RUN pnpm install --offline

# Build the Hono.js application
RUN npx turbo run build:hono --filter=@tantovale/server

# Production stage
FROM base AS runner
WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono

# Copy runtime files from the builder stage
COPY --from=builder --chown=hono:nodejs /app/apps/server/package.json ./
COPY --from=builder --chown=hono:nodejs /app/apps/server/dist ./dist

# Switch to non-root user
USER hono

# Expose the server's port
EXPOSE 4000
ENV PORT 4000
ENV HOSTNAME 0.0.0.0

# Run the server
CMD ["node", "dist/index.js"]
