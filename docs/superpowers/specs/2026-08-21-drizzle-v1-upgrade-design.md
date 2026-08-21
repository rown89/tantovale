# Drizzle v1 upgrade design

## Goal

Upgrade the backend from Drizzle ORM/Kit 0.x to the current Drizzle v1 release-candidate channel in one dedicated change. The result must preserve the existing PostgreSQL schema and API behavior while adopting the v1 relation, validation, and migration-metadata APIs.

## Scope

- Upgrade `drizzle-orm` and `drizzle-kit` together to their `@rc` releases.
- Replace `drizzle-zod` imports with `drizzle-orm/zod`, then remove `drizzle-zod`.
- Convert legacy `relations()` declarations to the v1 `defineRelations()` API.
- Convert the three active `db.query.*` relational-query call sites to Relational Queries v2.
- Run `drizzle-kit up` to convert the committed 0.x migration journal/snapshot layout to the v3 folder layout.
- Upgrade and validate the local PostgreSQL migration bookkeeping table.
- Update package scripts/configuration only where v1 compatibility requires it.

## Out of scope

- New tables, columns, indexes, or application schema migrations.
- PostgreSQL server upgrades or production database changes.
- Query performance refactors unrelated to the v1 compatibility work.
- Hono, Zod, pg, postgres.js, or other backend dependency upgrades.

## Compatibility design

### Dependencies and validation

Use the same v1 release channel for `drizzle-orm` and `drizzle-kit`. Migrate each `createInsertSchema` and `createSelectSchema` import from `drizzle-zod` to `drizzle-orm/zod`; the generated Zod schemas and their public exports must retain their current names and inferred shapes.

### Relations and queries

The source schema exports legacy per-table relation constants. Replace these with a central, typed `defineRelations(schema, ...)` configuration, using relation parts only if needed to keep individual schema modules understandable. Pass the resulting relation map to `drizzle()`.

Only three runtime call sites use `db.query.*`: password reset, password reset-token lookup, and refresh-token lookup. Convert those to RQB v2 equivalents and preserve each query's selected columns, filters, return shape, and null/not-found behavior. The remaining routes use the SQL-like query builder and should not be redesigned.

### Migration metadata

The repository currently stores a v0 migration SQL file, a JSON snapshot, and `_journal.json`. Run `drizzle-kit up` with the PostgreSQL config to migrate that committed metadata to the v3 migration folder structure. Commit the generated structural changes, including removal of obsolete journal/snapshot files where the command does so.

The operation is allowed to update the local database's `public.__drizzle_migrations__` bookkeeping table as specified by Drizzle v1. It must not run against a remote or production database, and it must not generate or apply a new application schema migration.

## Execution and validation

1. Capture the current migration directory and local migration-table state for comparison.
2. Update dependencies and lockfile, then run `drizzle-kit up` against the local config.
3. Convert imports, relation definitions, database initialization, and the three RQB call sites until the server type-checks.
4. Run `db:check:local` to validate migration history and the local migration command only if it confirms there is no unplanned schema DDL.
5. Run workspace lint, server and storefront type checks, server build, and the known-good storefront webpack production build.
6. Perform local database-backed smoke checks of the password-reset and refresh-token query paths, using only seeded/local data.

## Safety and rollback

- Keep this work on `codex/drizzle-v1-upgrade` until all validation passes.
- Commit conversion changes separately from any optional cleanup to make review and rollback clear.
- If v1 RC incompatibilities cannot be resolved without changing API behavior or application schema, stop before any remote database action and revert the branch to the main baseline.
- The local database is disposable; production migration bookkeeping is explicitly deferred to a separately reviewed deployment procedure.
