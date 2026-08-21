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
- OpenAPI/Scalar coverage is partial. Keep descriptions and schemas accurate when modifying an already documented endpoint; do not assume every route is documented.

## Quality and safety

- There is currently no automated test suite. Do not claim test coverage or assume CI runs linting/type checks; CI presently builds only.
- `next lint` was removed in Next 16. Run `pnpm --filter @workspace/storefront lint`, which invokes ESLint directly; `.next` must remain excluded from lint input.
- Workspace scripts use `typecheck`, while Turbo declares `check-types`; verify the actual command for a task rather than relying on Turbo task names.
- Prettier runs through the pre-commit hook; use the repository formatting configuration. Conventional Commit messages are enforced at commit time.
- Never expose or log `.env` values, JWTs, cookies, payment/shipping credentials, or webhook secrets.
- Do not assume scheduled workflows, webhook verification, migrations, or every exported route are operational; audit the relevant integration before relying on it.

## Dependency upgrades

- Treat later Next.js major upgrades as a dedicated, frontend-first change. The repository is on Next 16.3/React 19.2; review the official upgrade guide, generated agent rules, async request APIs, proxy conventions, and direct ESLint integration before changing versions.
- Keep Hono and its adapter/validator/OpenAPI packages compatible and update them together in a focused change. The repository mixes `hono-openapi` with a beta `@hono/zod-openapi`; do not consolidate those libraries without a separate API-documentation design.

<claude-mem-context>
# Memory Context

# [tantovale] recent context, 2026-08-21 8:30pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 31 obs (10,554t read) | 594,441t work | 98% savings

### Aug 21, 2026

20837 5:05p 🔵 pnpm packageManager entry uses incorrect SHA512 hash for version 10.12.1
20838 " 🔵 Corepack cache directory permission error blocks package manager initialization
20839 7:09p 🔴 Fixed pnpm checksum mismatch in package.json
20840 " 🔵 Comprehensive audit of Tantovale monorepo architecture and constraints
20841 " ✅ Created AGENTS.md with repository operating constraints and modernization guidance
20842 " 🔵 Mapped S3 integration scope and local development constraints
20843 " ✅ Created local development environment files with inert external service credentials
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

Access 594k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
