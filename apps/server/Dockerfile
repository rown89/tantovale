FROM node:22-alpine AS base

# Install pnpm
RUN npm install -g pnpm
# Setup pnpm environment manually
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN mkdir -p ${PNPM_HOME}

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

# Clean the dist directory first
RUN rm -rf /app/apps/server/dist

# Build the server and its dependencies
RUN pnpm turbo build --filter=@workspace/server...

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

# Copy package files
COPY --from=installer --chown=hono:nodejs /app/package.json ./
COPY --from=installer --chown=hono:nodejs /app/pnpm-lock.yaml ./
COPY --from=installer --chown=hono:nodejs /app/pnpm-workspace.yaml ./

# Copy all workspace packages
COPY --from=installer --chown=hono:nodejs /app/apps/server/package.json ./apps/server/
COPY --from=installer --chown=hono:nodejs /app/apps/server/dist ./apps/server/dist
COPY --from=installer --chown=hono:nodejs /app/packages ./packages


# Install dependencies with workspace option
USER root
RUN pnpm install --workspace-root --no-frozen-lockfile
USER hono

EXPOSE 4000

# Use tsx to run the server (can handle TS files)
CMD ["node", "apps/server/dist/src/index.js"]