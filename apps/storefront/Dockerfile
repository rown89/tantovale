# Use the node:22-alpine image as the base for all stages
FROM node:22-alpine AS base
# Globally install pnpm and turbo for use in later stages
# Using --silent to reduce log output and potential memory issues on platforms like Railway
RUN npm install -g pnpm@10.12.1 --silent
RUN npm install -g turbo --silent

# The 'builder' stage is responsible for creating a pruned, minimal version of the monorepo
FROM base AS builder
WORKDIR /app
# Copy the entire monorepo context into the builder
COPY . .
# Use 'turbo prune' to create a minimal workspace containing only the storefront app and its dependencies
RUN turbo prune @workspace/storefront --docker

# The 'installer' stage installs dependencies and builds the application
FROM base AS installer
WORKDIR /app
# Copy the pruned dependency definitions (package.json files) from the builder stage
COPY --from=builder /app/out/json/ .
# Copy the pruned lockfile
COPY --from=builder /app/out/pnpm-lock.yaml ./
# Install dependencies based on the pruned lockfile
RUN pnpm install --frozen-lockfile
# Copy the rest of the pruned source code required for the build
COPY --from=builder /app/out/full/ .
# Build the storefront application and ALL of its dependencies first
RUN pnpm --filter @workspace/storefront... run build

# Debugging: List the contents of the build output to verify what is being created.
RUN echo "--- Listing build output in /app/apps/storefront/.next ---" && \
    ls -la /app/apps/storefront/.next && \
    echo "--- Listing standalone output in /app/apps/storefront/.next/standalone ---" && \
    ls -la /app/apps/storefront/.next/standalone || echo "--- Standalone directory not found ---"

# The 'runner' stage creates the final, lightweight production image
FROM base AS runner
WORKDIR /app
# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# Copy the entire pruned and built application from the installer stage.
# This is more robust than relying on a potentially incomplete 'standalone' output.
COPY --from=installer --chown=nextjs:nodejs /app .
# Set the working directory to the specific application we want to run
WORKDIR /app/apps/storefront
# Set the user for the running container
USER nextjs
# Expose the port Next.js will run on
EXPOSE 3000
# The command to start the Next.js production server with standalone output
CMD ["node", ".next/standalone/server.js"]