FROM node:20-alpine AS base

FROM base AS builder

RUN apk update
RUN apk add --no-cache libc6-compat bash curl
# Set working directory
WORKDIR /app

# Install turbo globally
RUN npm install -g turbo
COPY . .
RUN turbo prune @workspace/storefront --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

# First install the dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN npm install

# Build the project
COPY --from=builder /app/out/full/ .

RUN npx turbo build --filter=@workspace/storefront

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