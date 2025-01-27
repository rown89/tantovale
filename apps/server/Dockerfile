# Base stage: Use official Node.js alpine image
FROM node:18-alpine AS base

# Install necessary system dependencies
RUN apk add --no-cache libc6-compat bash curl

# Build stage
FROM base AS builder
WORKDIR /app

# Install turbo globally
RUN npm install -g turbo

# Copy essential files for dependency installation
COPY package-lock.json .
COPY package.json .
COPY turbo.json .
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN npm ci

# Build the Hono.js application
COPY . .
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
CMD ["node", "apps/server/dist/index.js"]
