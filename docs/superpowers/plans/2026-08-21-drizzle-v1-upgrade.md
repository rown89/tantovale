# Drizzle v1 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Hono backend from Drizzle 0.x to Drizzle v1 RC while preserving PostgreSQL schema, API contracts, and local migration history.

**Architecture:** Replace standalone `drizzle-zod` with `drizzle-orm/zod`, replace distributed RQB v1 `relations()` declarations with one RQB v2 `defineRelations()` map, and convert migration metadata with `drizzle-kit up`. The existing Node Postgres driver, SQL-like queries, and table declarations remain in place.

**Tech Stack:** Node 22, pnpm 10, TypeScript 5.8, Hono, PostgreSQL, `pg`, Drizzle ORM/Kit v1 RC, Zod v4.

---

## File map

| Path                                                         | Upgrade responsibility                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `package.json`, `apps/server/package.json`, `pnpm-lock.yaml` | Compatible ORM/Kit RC dependencies; remove `drizzle-zod`.             |
| `apps/server/src/database/index.ts`                          | Supply RQB v2 relation map to the Node Postgres Drizzle client.       |
| `apps/server/src/database/schemas/relations.ts`              | New central RQB v2 relation owner.                                    |
| `apps/server/src/database/schemas/*.ts`                      | Retain tables/Zod exports; remove legacy relation blocks and imports. |
| Password/reset routes and auth utility                       | Convert the three runtime RQB v1 `findFirst` filters.                 |
| `apps/server/src/database/drizzle/migrations/**`             | Drizzle Kit v3 metadata conversion only.                              |

### Task 1: Record a read-only local baseline

**Files:**

- Create: `/private/tmp/tantovale-drizzle-v1-baseline.txt`
- Modify: none

- [ ] **Step 1: Verify branch and change scope.**

Run:

```bash
git branch --show-current
git status --short
git diff -- apps/server/src/database package.json apps/server/package.json pnpm-lock.yaml
```

Expected: `codex/drizzle-v1-upgrade`; no Drizzle implementation edits before this plan begins. Preserve, but do not stage, the session-managed `AGENTS.md` change.

- [ ] **Step 2: Capture legacy migration metadata and baseline checks.**

Run:

```bash
pnpm --filter @workspace/server exec drizzle-kit --version
find apps/server/src/database/drizzle/migrations -maxdepth 2 -type f | sort
sed -n '1,160p' apps/server/src/database/drizzle/migrations/meta/_journal.json
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server build
```

Expected: Drizzle 0.x, one SQL migration with snapshot and `_journal.json`, and successful baseline commands.

- [ ] **Step 3: Inspect only local migration bookkeeping columns.**

Run:

```bash
pnpm --filter @workspace/server exec tsx -e "import { createClient } from './src/database/index.ts'; const { db, client } = createClient(); const result = await db.execute('select column_name, data_type from information_schema.columns where table_schema = \'public\' and table_name = \'__drizzle_migrations__\' order by ordinal_position'); console.table(result.rows); await client.end();"
```

Expected: legacy bookkeeping columns. Stop if the local database is unavailable; never replace it with a remote connection.

### Task 2: Upgrade packages and generated Zod adapter imports

**Files:**

- Modify: `package.json`
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: every file matched by `rg -l "from 'drizzle-zod'" apps/server/src -g '*.ts'`

- [ ] **Step 1: Inventory all standalone adapter imports.**

Run:

```bash
rg -l "from 'drizzle-zod'" apps/server/src -g '*.ts' | sort
```

Expected: every schema file that exports `createInsertSchema` or `createSelectSchema`; do not allow a mixed import set.

- [ ] **Step 2: Upgrade ORM and Kit together, then remove the standalone adapter.**

Run:

```bash
pnpm up drizzle-orm@rc drizzle-kit@rc --filter @workspace/server --filter workspace
pnpm remove drizzle-zod --filter @workspace/server --filter workspace
```

Expected: only Drizzle packages and lockfile change. Do not update Zod, Hono, `pg`, `postgres`, or unrelated dependencies.

- [ ] **Step 3: Replace every adapter import with the built-in v1 export.**

Use this exact conversion in every file found in Step 1; preserve all generated schema constants and their public names.

```ts
// Before
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

// After
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/zod';
```

- [ ] **Step 4: Verify compatibility and commit.**

Run:

```bash
rg "drizzle-zod" package.json apps/server packages pnpm-lock.yaml
pnpm --filter @workspace/server typecheck
git add package.json apps/server/package.json pnpm-lock.yaml apps/server/src
git commit -m "chore(server): upgrade Drizzle packages"
```

Expected: the search has no results and type-check exits 0 before the commit.

### Task 3: Convert migration metadata and local bookkeeping

**Files:**

- Modify: `apps/server/src/database/drizzle/migrations/**`
- Modify: `apps/server/package.json` only if v1 requires script changes

- [ ] **Step 1: Confirm the RC CLI reads the existing config.**

Run:

```bash
pnpm --filter @workspace/server exec drizzle-kit --version
pnpm --filter @workspace/server exec drizzle-kit up --help
```

Expected: v1 RC command output. Review help before conversion.

- [ ] **Step 2: Convert only tracked migration metadata.**

Run:

```bash
pnpm --filter @workspace/server exec drizzle-kit up --config ./src/database/drizzle.config.ts
find apps/server/src/database/drizzle/migrations -maxdepth 3 -type f | sort
git diff -- apps/server/src/database/drizzle/migrations
```

Expected: Kit replaces legacy journal/snapshot metadata with v3 folders. Do not run `generate`, `push`, `drop`, or a production migration command.

- [ ] **Step 3: Reject unintended application DDL.**

Run:

```bash
git diff --check -- apps/server/src/database/drizzle/migrations
git diff -- apps/server/src/database/drizzle/migrations
```

Expected: layout/metadata conversion only. Stop if new `CREATE`, `ALTER`, `DROP`, or data-changing SQL appears that was absent from the legacy migration.

- [ ] **Step 4: Check local migration state and commit.**

Run:

```bash
pnpm --filter @workspace/server run db:check:local
pnpm --filter @workspace/server exec tsx -e "import { createClient } from './src/database/index.ts'; const { db, client } = createClient(); const result = await db.execute('select column_name, data_type from information_schema.columns where table_schema = \'public\' and table_name = \'__drizzle_migrations__\' order by ordinal_position'); console.table(result.rows); await client.end();"
git add apps/server/src/database/drizzle/migrations apps/server/package.json
git commit -m "chore(database): convert Drizzle migration metadata"
```

Expected: `db:check:local` exits 0 and local bookkeeping includes v1 fields such as `name` and `applied_at`. This is the only allowed database mutation.

### Task 4: Replace legacy relation declarations with one RQB v2 relation map

**Files:**

- Create: `apps/server/src/database/schemas/relations.ts`
- Modify: `apps/server/src/database/index.ts`
- Modify: every module returned by `rg -l 'relations\\(' apps/server/src/database/schemas -g '*.ts'`

- [ ] **Step 1: Generate a candidate from local PostgreSQL into a disposable location.**

Run:

```bash
pnpm --filter @workspace/server exec drizzle-kit pull --config ./src/database/drizzle.config.ts --out /private/tmp/tantovale-drizzle-v1-pull
sed -n '1,360p' /private/tmp/tantovale-drizzle-v1-pull/relations.ts
```

Expected: a `defineRelations()` map from actual foreign keys. Never copy generated schema/migration files from `/private/tmp` into the repository.

- [ ] **Step 2: Create the central relation owner using the generated candidate.**

Create `apps/server/src/database/schemas/relations.ts` in this form:

```ts
import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

export const relations = defineRelations(schema, (r) => ({
	chat_messages: {
		chat_room: r.one.chat_rooms({
			from: r.chat_messages.chat_room_id,
			to: r.chat_rooms.id,
		}),
	},
}));
```

Transcribe every relation in the generated candidate after comparing each old source-table edge. The central map must cover: `addresses`, `categories`, `chat_messages`, `chat_rooms`, `cities`, `countries`, `entityTrustapTransactions`, `items`, `items_images`, `items_properties_values`, `orders`, `orders_proposals`, `password_reset_tokens`, `profiles`, `profiles_items_favorites`, `property_values`, `regions`, `shippings`, `states`, `subRegions`, `subcategories`, and `subcategory_properties`. For `orders` buyer/seller relations, use Kit-generated aliases rather than inventing them.

- [ ] **Step 3: Delete legacy relation blocks after the central map type-checks.**

For every file found here, delete the `relations` import and `export const ...Relations = relations(...)` block; retain table definitions, relation-independent types, and Zod exports.

```bash
rg -l 'relations\\(' apps/server/src/database/schemas -g '*.ts' | sort
```

Expected afterward: no source-schema result.

- [ ] **Step 4: Supply the new map to Node Postgres Drizzle.**

Update `apps/server/src/database/index.ts`, retaining `schema` for `NodePgDatabase<typeof schema>` typing:

```ts
import { relations } from './schemas/relations';

const db = drizzle(client, { relations });
```

- [ ] **Step 5: Type-check and commit.**

Run:

```bash
pnpm --filter @workspace/server typecheck
git add apps/server/src/database/index.ts apps/server/src/database/schemas
git commit -m "refactor(database): migrate relations to RQB v2"
```

Expected: type-check exits 0. Correct missing or ambiguous edges from the generated candidate; never restore RQB v1.

### Task 5: Convert runtime RQB filters and execute local read-only smoke checks

**Files:**

- Modify: `apps/server/src/routes/password/forgot-password.ts`
- Modify: `apps/server/src/routes/password/reset-password.ts`
- Modify: `apps/server/src/middlewares/authMiddleware/utils.ts`
- Create: `/private/tmp/tantovale-drizzle-v1-rqb-smoke.ts`

- [ ] **Step 1: Convert all three `findFirst` filters to RQB v2 objects.**

```ts
// forgot-password.ts
const user = await db.query.users.findFirst({ where: { email } });

// reset-password.ts
const storedToken = await db.query.password_reset_tokens.findFirst({ where: { token } });

// authMiddleware/utils.ts
const storedRefreshToken = await db.query.refreshTokens.findFirst({ where: { token: refresh_token } });
```

Remove an `eq` import only if the file no longer uses it for a SQL-like query.

- [ ] **Step 2: Create a disposable read-only smoke script.**

Create `/private/tmp/tantovale-drizzle-v1-rqb-smoke.ts`:

```ts
import { createClient } from '/Users/rown/Desktop/tantovale/apps/server/src/database/index.ts';

const { db, client } = createClient();
try {
	const rows = await Promise.all([
		db.query.users.findFirst({ where: { email: '__drizzle_v1_missing__@example.invalid' } }),
		db.query.password_reset_tokens.findFirst({ where: { token: '__drizzle_v1_missing__' } }),
		db.query.refreshTokens.findFirst({ where: { token: '__drizzle_v1_missing__' } }),
	]);
	if (rows.some((row) => row !== undefined)) throw new Error('Unexpected smoke-query row');
	console.log('Drizzle v1 RQB smoke checks passed');
} finally {
	await client.end();
}
```

- [ ] **Step 3: Run smoke/static checks, delete helper, and commit.**

Run:

```bash
pnpm --filter @workspace/server exec tsx /private/tmp/tantovale-drizzle-v1-rqb-smoke.ts
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server lint
rm /private/tmp/tantovale-drizzle-v1-rqb-smoke.ts
git add apps/server/src/routes/password/forgot-password.ts apps/server/src/routes/password/reset-password.ts apps/server/src/middlewares/authMiddleware/utils.ts
git commit -m "refactor(server): migrate relational queries to v2"
```

Expected: smoke output is `Drizzle v1 RQB smoke checks passed`; no helper is committed.

### Task 6: Complete compatibility gates and request review

**Files:**

- Modify: only files identified by Tasks 2-5

- [ ] **Step 1: Confirm no legacy APIs remain.**

Run:

```bash
rg "drizzle-zod|relations\\(|drizzle-orm/relations" apps/server/src package.json apps/server/package.json
rg "db\\.query\\..*findFirst" apps/server/src
```

Expected: first command has no results; second contains only the three RQB v2 object-filter sites.

- [ ] **Step 2: Run local migration and repository quality gates.**

Run:

```bash
pnpm --filter @workspace/server run db:check:local
pnpm --filter @workspace/server exec drizzle-kit check --config ./src/database/drizzle.config.ts
pnpm lint
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/shared exec tsc --noEmit
pnpm --filter @workspace/ui typecheck
pnpm --filter @workspace/storefront typecheck
pnpm --filter @workspace/server build
pnpm --filter @workspace/storefront exec next build --webpack
```

Expected: every command exits 0. Webpack is intentional because the unrelated Turbopack CSS/PostCSS production-build panic remains known.

- [ ] **Step 3: Inspect migration safety and request review.**

Run:

```bash
git diff main...HEAD -- apps/server/src/database/drizzle
git diff --check main...HEAD
git status --short
```

Expected: only v3 metadata conversion, no new application schema migration, no seed data, and no secret. Request code review focused on relation cardinality/aliases, migration layout, local-only safety, and the three RQB behavior-preservation cases.
