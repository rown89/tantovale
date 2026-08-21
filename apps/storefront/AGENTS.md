<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Tantovale storefront rules

- This app uses Next.js 16.3 with the App Router and React 19.2. Use `src/proxy.ts`; do not recreate `middleware.ts`.
- Do not enable Cache Components or add `instant` route configuration without an approved caching migration.
- Run `pnpm --filter @workspace/storefront lint` for direct ESLint checks. The configuration must ignore `.next/**`.
- Imports from `@workspace/server` resolve to its compiled public exports in production. Validate deployment changes with the root `pnpm build`, not only a standalone storefront build.
