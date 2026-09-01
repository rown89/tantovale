# Tantovale repository guidance

## Scope and tooling

- This is a pnpm/Turborepo monorepo: `apps/storefront` is Next.js, `apps/server` is the Hono API, and `packages/ui` and `packages/shared` are shared workspace packages.
- Use Node 22 and run pnpm commands from the repository root. Do not use npm or yarn for workspace work.
- Keep `pnpm-lock.yaml` committed. Do not update dependencies, regenerate the lockfile, or run `clean-all` unless the task explicitly requires it.
- `clean-all` is destructive: it removes lockfiles, dependencies, caches, and build output.
- Root scripts are the entry points: `pnpm dev`, `pnpm build`, `pnpm dev-storefront`, and `pnpm dev-server`. Database commands and seeders can mutate shared state; run them only with explicit authorization.
- The root `packageManager` checksum is authoritative. When changing pnpm, review every workspace manifest's `packageManager` entry; stale app-level entries can make Corepack fail when invoked from an app directory.

## Frontend: `apps/storefront`

- The storefront uses Next.js 16.3 and the App Router with React 19.2. Default to Server Components; add `'use client'` only for browser APIs, interaction, React Query, Zustand, or client hooks.
- Next 16 uses Turbopack by default. Keep `next dev` and `next build` free of explicit Turbopack flags unless an intentional opt-out is documented. Use `src/proxy.ts` (not the deprecated `middleware.ts`) for request interception.
- Do not enable `cacheComponents` or add route `instant` configuration as part of routine work; this legacy application has not adopted the Cache Components model.
- Use `@workspace/server/client-rpc` for API access. Server-side calls must explicitly forward authentication cookies; browser calls depend on `credentials: 'include'`.
- Keep TanStack Query for remote/server state and Zustand for transient UI and multi-step workflow state. Do not introduce a second state-management system without discussion.
- Authentication spans Next server actions and route handlers, Hono-issued cookies, storefront middleware, and `AuthProvider`. Preserve that end-to-end flow when changing login, logout, refresh, verification, or protected routes.
- `@workspace/ui` is the shared component and global-style boundary. The project presently mixes Tailwind 3 declarations in the storefront with Tailwind 4/PostCSS in the UI package; do not upgrade Tailwind, shadcn, Next, React, or related tooling independently.
- The storefront imports selected server schemas, enums, utilities, and RPC types directly. `@workspace/server` is transpiled by Next, so assess client/server bundle implications before changing cross-package exports.

## Backend: `apps/server`

- The Hono app is composed in `src/app.ts`; new routers must use `createRouter()` and be mounted there. Route changes alter the typed RPC contract used by the storefront.
- Validate external input with the existing Zod/Hono validator pattern and authorize every mutation in the route itself. Error responses are legacy and inconsistent; preserve caller compatibility unless a task explicitly standardizes the contract.
- Paths containing `auth` are subject to global authentication middleware, and many routes explicitly add it as well. Do not rename or reorganize protected route paths casually.
- Use the existing Drizzle schemas and transactions for multi-write workflows. Do not run `db:push`, migrations, or seeders without explicit approval.
- Payment, shipping, S3 upload, SMTP, cron, webhook, and token flows are external-system boundaries. Treat endpoint paths, cookie options, expiry, state enums, and provider payloads as compatibility-sensitive.
- OpenAPI/Scalar covers all 63 mounted API operations. Keep handler metadata and runtime behavior aligned, update the canonical `docs/api/tantovale.openapi.json` artifact when contracts change, and run `pnpm --filter @workspace/server api:check` to detect drift.

## Quality and safety

- The backend has an automated API suite backed by disposable Docker services and local provider stubs. Use `pnpm --filter @workspace/server test:api` for the full suite and `pnpm --filter @workspace/server test:api:coverage` for the CI coverage gate; the enforced minimums are 90% lines, 90% functions, and 85% branches.
- `.github/workflows/backend-api.yml` gates backend pull requests and pushes to `main` with server lint, typecheck, build, API coverage, and the canonical OpenAPI check. Keep the documented Node 22 and frozen pnpm install contract working.
- Backend tests must use disposable Postgres/MinIO/Mailpit instances and local Trustap/Shippo/SMTP stubs. Never point automated tests at live external services or real credentials.
- `next lint` was removed in Next 16. Run `pnpm --filter @workspace/storefront lint`, which invokes ESLint directly; `.next` must remain excluded from lint input.
- Workspace scripts use `typecheck`, while Turbo declares `check-types`; verify the actual command for a task rather than relying on Turbo task names.
- Prettier runs through the pre-commit hook; use the repository formatting configuration. Conventional Commit messages are enforced at commit time.
- Never expose or log `.env` values, JWTs, cookies, payment/shipping credentials, or webhook secrets.
- Do not assume deployment schedules, provider configuration, webhook delivery, or migrations are operational merely because their local contracts are tested; audit the relevant deployed integration before relying on it.

## Dependency upgrades

- Treat later Next.js major upgrades as a dedicated, frontend-first change. The repository is on Next 16.3/React 19.2; review the official upgrade guide, generated agent rules, async request APIs, proxy conventions, and direct ESLint integration before changing versions.
- Keep Hono and its adapter/validator/OpenAPI packages compatible and update them together in a focused change. The repository mixes `hono-openapi` with a beta `@hono/zod-openapi`; do not consolidate those libraries without a separate API-documentation design.

<claude-mem-context>
# Memory Context

# [tantovale] recent context, 2026-08-21 9:31pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,605t read) | 928,778t work | 98% savings

### Aug 21, 2026

20839 7:09p 🔴 Fixed pnpm checksum mismatch in package.json
20840 " 🔵 Comprehensive audit of Tantovale monorepo architecture and constraints
20841 " ✅ Created AGENTS.md with repository operating constraints and modernization guidance
20842 " 🔵 Mapped S3 integration scope and local development constraints
20844 7:13p 🔵 Dev script missing Node ESM import condition configuration
20845 7:17p 🔵 Local development baseline verified working with known constraints
20846 7:24p 🔵 Address toast triggered by browser-side check failure, not missing data
20847 " ⚖️ Next.js v15 to v16 upgrade path selected using @next/codemod
20848 " 🔵 Storefront uses async route signatures with Promise-wrapped params
20849 7:33p 🔴 Removed incompatible Cache Components export from Next.js 16 routes
20850 " 🔵 Server package exports successfully resolve in production build context
20851 " ✅ Next.js dev server requires escalated permissions for localhost:3000 binding
20852 7:37p 🔵 Turbopack panic in CSS processing during production build
20853 7:38p 🔵 Webpack build reveals stale TypeScript declarations and composite config conflict
20854 7:50p 🔵 TypeScript configuration architecture mismatch in packages/ui
20855 " ⚖️ Diagnostic testing approach: temporary source-mode config for architecture validation
20856 7:57p 🔴 UI Package TypeScript Configuration Corrected
20857 " 🔴 Production Build Pipeline Now Succeeds
20858 " ✅ ESLint Added as UI Package Development Dependency
20859 8:07p 🔵 ESLint coverage gaps across monorepo packages
20860 " ✅ Extended ESLint coverage to all monorepo packages with standardized zero-warning policy
20861 " 🔵 38 ESLint warnings catalogued in storefront package
20862 8:11p 🔴 Enabled strict ESLint rules and corrected all violations source-level
20863 " 🔴 Fixed TypeScript type errors by removing problematic any types and correcting generics
20864 " ✅ Configured Turbo global environment variables and declared React peer dependency
20865 8:30p 🟣 ESLint Configuration and Lint Coverage Complete Across All Packages
20866 " 🔴 Fixed API Contract Violation in Address Form Submission
20867 " ⚖️ Drizzle ORM v1 Upgrade Strategy: Staged Approach
20868 8:35p ⚖️ Drizzle v0→v1 upgrade scoped as single comprehensive change
20869 8:41p 🔵 Drizzle v0.x baseline captured; tsx socket permissions block database introspection
20870 8:45p 🔵 pnpm store location mismatch blocking Drizzle upgrade
20871 8:49p 🔵 Drizzle v1 migration task blocked by missing explicit local configuration
20872 8:50p 🟣 Drizzle ORM upgraded from v0 to v1.0.0-rc.4
20873 " 🔵 Local development database confirmed at localhost:5432/tantovale_dev
20874 " ⚖️ Drizzle v1 migration split into phased tasks to isolate breaking API changes
20875 8:53p ✅ Drizzle config decoupled from legacy schema import
20876 " 🔵 Legacy database state confirmed untracked and unbootstrapped
20877 8:57p 🔵 Drizzle-kit v1 CLI constraint: --config and --out flags mutually exclusive
20878 " 🔵 Codex baseline: 22 legacy relation-owning schema modules identified for Drizzle v1 migration
20879 9:06p 🟣 Implemented centralized RQB v2 relation map for Drizzle database
20880 " 🔴 Resolved relation name collision in countries schema
20881 " 🔴 Removed orphaned profiles.city relation without backing foreign key
20882 " ✅ Removed v1-incompatible migration config prefix setting
20883 " 🔵 Validated all 23 table relations load without errors at runtime
20884 " ✅ Updated database client initialization to use RQB v2 relation map
20885 " ✅ Confirmed no remaining relation definition artifacts in schema layer
20886 " ⚖️ Preserved Task 5 scope boundary: RQB v1 callback-filter sites left untouched
20887 9:08p 🔄 Drizzle ORM v1→v2 Runtime Query Filter Migration
20888 9:23p 🔵 Duplicate FK relation definitions identified in generated relations.ts
20889 9:27p 🟣 Drizzle ORM Relations Schema Audit and Completion

Access 929k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
