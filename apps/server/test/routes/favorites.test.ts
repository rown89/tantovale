import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { items, profiles_items_favorites } from '../../src/database/schemas/schema';
import { itemStatus } from '../../src/database/schemas/enumerated_values';
import { createCommerceActors, createItemFixture } from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import type { CookieJar } from '../helpers/request';

const FAVORITE_CONFLICT_BARRIER_FIRST_KEY = 1_907_801_438;
const FAVORITE_CONFLICT_BARRIER_SECOND_KEY = 1_393_617_629;
const FAVORITE_UNIQUE_INDEX = 'profiles_favorites_unique_profile_item_idx';
const migrationsDirectory = fileURLToPath(new URL('../../src/database/drizzle/migrations/', import.meta.url));

async function handleFavorite(jar: CookieJar, action: 'add' | 'remove', itemId: number): Promise<Response> {
	return authenticatedRequest('/favorites/auth/handle', 'POST', jar, { action, item_id: itemId });
}

async function favoriteRows(profileId: number, itemId: number) {
	const { db } = getTestDatabase();
	return db
		.select({ id: profiles_items_favorites.id })
		.from(profiles_items_favorites)
		.where(and(eq(profiles_items_favorites.profile_id, profileId), eq(profiles_items_favorites.item_id, itemId)));
}

function favoriteUniqueMigration(): string {
	const migration = readdirSync(migrationsDirectory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => readFileSync(`${migrationsDirectory}/${entry.name}/migration.sql`, 'utf8'))
		.find((sql) => sql.includes(`CREATE UNIQUE INDEX "${FAVORITE_UNIQUE_INDEX}"`));

	if (!migration) throw new Error(`Missing migration that creates ${FAVORITE_UNIQUE_INDEX} as UNIQUE`);
	return migration.replaceAll('--> statement-breakpoint', '');
}

async function waitForExactAdvisoryLockWaiter(
	connection: PoolClient,
	blockerPid: number,
	firstKey: number,
	secondKey: number,
): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const { rows } = await connection.query<{ waiting: number }>(
			`
			SELECT count(*)::int AS waiting
			FROM pg_locks AS waiting_lock
			WHERE waiting_lock.locktype = 'advisory'
				AND waiting_lock.database = (SELECT oid FROM pg_database WHERE datname = current_database())
				AND waiting_lock.classid = $1::oid
				AND waiting_lock.objid = $2::oid
				AND waiting_lock.objsubid = 2
				AND waiting_lock.granted = false
				AND $3::integer = ANY(pg_blocking_pids(waiting_lock.pid))
		`,
			[firstKey, secondKey, blockerPid],
		);
		if ((rows[0]?.waiting ?? 0) > 0) return;
		await connection.query('SELECT pg_sleep(0.01)');
	}
	throw new Error(`Timed out waiting for exact favorite advisory lock (${firstKey}, ${secondKey})`);
}

describe('favorite routes', () => {
	describe('GET /favorites/auth/check/:item_id', () => {
		it('requires authentication', async () => {
			const response = await app.request('/favorites/auth/check/1');

			expect(response.status).toBe(401);
		});

		it.each([
			['not-a-number', { error: 'Item id is required' }],
			['0', { error: 'Item id is required' }],
			['-1', { message: 'Invalid Item ID' }],
			['1.5', { message: 'Invalid Item ID' }],
			['2147483648', { message: 'Invalid Item ID' }],
		] as const)('rejects malformed item ID %s with its legacy body', async (itemId, expectedBody) => {
			const actors = await createCommerceActors();
			const response = await authenticatedRequest(`/favorites/auth/check/${itemId}`, 'GET', actors.buyer.jar);

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual(expectedBody);
		});

		it('returns false for an absent item without creating state', async () => {
			const actors = await createCommerceActors();
			const response = await authenticatedRequest('/favorites/auth/check/2147483647', 'GET', actors.buyer.jar);

			expect(response.status).toBe(200);
			expect(await response.json()).toBe(false);
		});

		it('returns favorite state scoped to the authenticated profile', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db.insert(profiles_items_favorites).values({
				profile_id: actors.buyer.profile.id,
				item_id: item.id,
			});

			const [buyerResponse, outsiderResponse] = await Promise.all([
				authenticatedRequest(`/favorites/auth/check/${item.id}`, 'GET', actors.buyer.jar),
				authenticatedRequest(`/favorites/auth/check/${item.id}`, 'GET', actors.outsider.jar),
			]);

			expect(buyerResponse.status).toBe(200);
			expect(await buyerResponse.json()).toBe(true);
			expect(outsiderResponse.status).toBe(200);
			expect(await outsiderResponse.json()).toBe(false);
		});
	});

	describe('POST /favorites/auth/handle', () => {
		it('requires authentication', async () => {
			const response = await app.request('/favorites/auth/handle', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'add', item_id: 1 }),
			});

			expect(response.status).toBe(401);
		});

		it.each([
			{},
			{ action: 'invalid', item_id: 1 },
			{ action: 'add' },
			{ action: 'add', item_id: '1' },
			{ action: 'add', item_id: 0 },
			{ action: 'add', item_id: -1 },
			{ action: 'add', item_id: 1.5 },
			{ action: 'add', item_id: 2_147_483_648 },
		])('rejects malformed input %#', async (body) => {
			const actors = await createCommerceActors();
			const response = await authenticatedRequest('/favorites/auth/handle', 'POST', actors.buyer.jar, body);

			expect(response.status).toBe(400);
		});

		it("adds another profile's published available item and preserves the boolean response contract", async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);

			const response = await handleFavorite(actors.buyer.jar, 'add', item.id);

			expect(response.status).toBe(200);
			expect(await response.json()).toBe(true);
			expect(await favoriteRows(actors.buyer.profile.id, item.id)).toHaveLength(1);
		});

		it('returns 404 and writes nothing when adding an absent item', async () => {
			const actors = await createCommerceActors();

			const response = await handleFavorite(actors.buyer.jar, 'add', 2_147_483_647);

			expect(response.status).toBe(404);
			expect(await favoriteRows(actors.buyer.profile.id, 2_147_483_647)).toEqual([]);
		});

		it('rejects adding an item owned by the authenticated profile', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);

			const response = await handleFavorite(actors.seller.jar, 'add', item.id);

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: 'You cannot favorite your own item' });
			expect(await favoriteRows(actors.seller.profile.id, item.id)).toEqual([]);
		});

		it.each([
			['unpublished', { published: false }],
			['unavailable', { status: itemStatus.SOLD }],
			['deleted', { deleted_at: new Date() }],
		] as const)('returns 404 and writes nothing for an item that is %s', async (_label, update) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db.update(items).set(update).where(eq(items.id, item.id));

			const response = await handleFavorite(actors.buyer.jar, 'add', item.id);

			expect(response.status).toBe(404);
			expect(await favoriteRows(actors.buyer.profile.id, item.id)).toEqual([]);
		});

		it('keeps sequential duplicate adds idempotent by profile and item', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);

			const first = await handleFavorite(actors.buyer.jar, 'add', item.id);
			const repeated = await handleFavorite(actors.buyer.jar, 'add', item.id);

			expect(first.status).toBe(200);
			expect(await first.json()).toBe(true);
			expect(repeated.status).toBe(200);
			expect(await repeated.json()).toBe(true);
			expect(await favoriteRows(actors.buyer.profile.id, item.id)).toHaveLength(1);
		});

		it('enforces profile and item uniqueness for writers that bypass the route', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client, db } = getTestDatabase();

			await db.insert(profiles_items_favorites).values({
				profile_id: actors.buyer.profile.id,
				item_id: item.id,
			});

			await expect(
				db.insert(profiles_items_favorites).values({
					profile_id: actors.buyer.profile.id,
					item_id: item.id,
				}),
			).rejects.toThrow();
			expect(await favoriteRows(actors.buyer.profile.id, item.id)).toHaveLength(1);

			const { rows } = await client.query<{ indisunique: boolean }>(
				`SELECT index_relation.indisunique
				 FROM pg_index AS index_relation
				 INNER JOIN pg_class AS index_class ON index_class.oid = index_relation.indexrelid
				 WHERE index_class.relname = $1`,
				[FAVORITE_UNIQUE_INDEX],
			);
			expect(rows).toEqual([{ indisunique: true }]);
		});

		it('reconciles duplicate legacy rows before replacing the old index with a unique index', async () => {
			const migrationSql = favoriteUniqueMigration();
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client } = getTestDatabase();
			const connection = await client.connect();

			try {
				await connection.query(`DROP INDEX "${FAVORITE_UNIQUE_INDEX}"`);
				await connection.query(
					`CREATE INDEX "${FAVORITE_UNIQUE_INDEX}"
					 ON user_items_favorites (profile_id, item_id)`,
				);
				const inserted = await connection.query<{ id: number }>(
					`INSERT INTO user_items_favorites (profile_id, item_id)
					 VALUES ($1, $2), ($1, $2), ($1, $2)
					 RETURNING id`,
					[actors.buyer.profile.id, item.id],
				);
				const canonicalId = Math.min(...inserted.rows.map(({ id }) => id));

				await connection.query(migrationSql);

				const reconciled = await connection.query<{ id: number }>(
					`SELECT id FROM user_items_favorites
					 WHERE profile_id = $1 AND item_id = $2`,
					[actors.buyer.profile.id, item.id],
				);
				expect(reconciled.rows).toEqual([{ id: canonicalId }]);
				const index = await connection.query<{ indisunique: boolean }>(
					`SELECT index_relation.indisunique
					 FROM pg_index AS index_relation
					 INNER JOIN pg_class AS index_class ON index_class.oid = index_relation.indexrelid
					 WHERE index_class.relname = $1`,
					[FAVORITE_UNIQUE_INDEX],
				);
				expect(index.rows).toEqual([{ indisunique: true }]);
			} finally {
				await connection.query(`
					DELETE FROM user_items_favorites AS duplicate
					USING user_items_favorites AS canonical
					WHERE duplicate.profile_id = canonical.profile_id
						AND duplicate.item_id = canonical.item_id
						AND duplicate.id > canonical.id
				`);
				await connection.query(`DROP INDEX IF EXISTS "${FAVORITE_UNIQUE_INDEX}"`);
				await connection.query(
					`CREATE UNIQUE INDEX "${FAVORITE_UNIQUE_INDEX}"
					 ON user_items_favorites (profile_id, item_id)`,
				);
				connection.release();
			}
		});

		it('blocks concurrent duplicate adds on the exact profile and item route lock', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client } = getTestDatabase();
			const barrierConnection = await client.connect();

			try {
				await barrierConnection.query('BEGIN');
				const blocker = await barrierConnection.query<{ pid: number }>(
					'SELECT pg_backend_pid() AS pid, pg_advisory_xact_lock($1, $2)',
					[actors.buyer.profile.id, item.id],
				);
				const blockerPid = blocker.rows[0]?.pid;
				if (!blockerPid) throw new Error('Missing exact favorite lock blocker PID');

				const responsesPromise = Promise.all(
					Array.from({ length: 12 }, () => handleFavorite(actors.buyer.jar, 'add', item.id)),
				);
				await waitForExactAdvisoryLockWaiter(barrierConnection, blockerPid, actors.buyer.profile.id, item.id);
				await barrierConnection.query('COMMIT');

				const responses = await responsesPromise;
				expect(responses.map(({ status }) => status)).toEqual(Array.from({ length: 12 }, () => 200));
				expect(await Promise.all(responses.map((response) => response.json()))).toEqual(
					Array.from({ length: 12 }, () => true),
				);
				expect(await favoriteRows(actors.buyer.profile.id, item.id)).toHaveLength(1);
			} finally {
				await barrierConnection.query('ROLLBACK');
				barrierConnection.release();
			}
		});

		it('treats a bypass writer winning after the route check as an idempotent add', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client } = getTestDatabase();
			const barrierConnection = await client.connect();
			const bypassConnection = await client.connect();

			try {
				await barrierConnection.query(`
					CREATE FUNCTION test_block_favorite_insert() RETURNS trigger AS $$
					BEGIN
						IF current_setting('tantovale.test_skip_favorite_barrier', true) IS DISTINCT FROM 'on' THEN
							PERFORM pg_advisory_xact_lock(
								${FAVORITE_CONFLICT_BARRIER_FIRST_KEY},
								${FAVORITE_CONFLICT_BARRIER_SECOND_KEY}
							);
						END IF;
						RETURN NEW;
					END;
					$$ LANGUAGE plpgsql
				`);
				await barrierConnection.query(`
					CREATE TRIGGER test_favorite_insert_barrier
					BEFORE INSERT ON user_items_favorites
					FOR EACH ROW EXECUTE FUNCTION test_block_favorite_insert()
				`);
				await barrierConnection.query('BEGIN');
				const blocker = await barrierConnection.query<{ pid: number }>(
					'SELECT pg_backend_pid() AS pid, pg_advisory_xact_lock($1, $2)',
					[FAVORITE_CONFLICT_BARRIER_FIRST_KEY, FAVORITE_CONFLICT_BARRIER_SECOND_KEY],
				);
				const blockerPid = blocker.rows[0]?.pid;
				if (!blockerPid) throw new Error('Missing favorite conflict barrier PID');

				const responsePromise = handleFavorite(actors.buyer.jar, 'add', item.id);
				await waitForExactAdvisoryLockWaiter(
					barrierConnection,
					blockerPid,
					FAVORITE_CONFLICT_BARRIER_FIRST_KEY,
					FAVORITE_CONFLICT_BARRIER_SECOND_KEY,
				);

				await bypassConnection.query('BEGIN');
				await bypassConnection.query(`SELECT set_config('tantovale.test_skip_favorite_barrier', 'on', true)`);
				await bypassConnection.query(`INSERT INTO user_items_favorites (profile_id, item_id) VALUES ($1, $2)`, [
					actors.buyer.profile.id,
					item.id,
				]);
				await bypassConnection.query('COMMIT');
				await barrierConnection.query('COMMIT');

				const response = await responsePromise;
				expect(response.status).toBe(200);
				expect(await response.json()).toBe(true);
				expect(await favoriteRows(actors.buyer.profile.id, item.id)).toHaveLength(1);
			} finally {
				await bypassConnection.query('ROLLBACK');
				await barrierConnection.query('ROLLBACK');
				await barrierConnection.query('DROP TRIGGER IF EXISTS test_favorite_insert_barrier ON user_items_favorites');
				await barrierConnection.query('DROP FUNCTION IF EXISTS test_block_favorite_insert()');
				bypassConnection.release();
				barrierConnection.release();
			}
		});

		it('allows two profiles to favorite the same item independently', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);

			const [buyerResponse, outsiderResponse] = await Promise.all([
				handleFavorite(actors.buyer.jar, 'add', item.id),
				handleFavorite(actors.outsider.jar, 'add', item.id),
			]);

			expect(buyerResponse.status).toBe(200);
			expect(outsiderResponse.status).toBe(200);
			expect(await favoriteRows(actors.buyer.profile.id, item.id)).toHaveLength(1);
			expect(await favoriteRows(actors.outsider.profile.id, item.id)).toHaveLength(1);
		});

		it("removes only the authenticated profile's favorite", async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db.insert(profiles_items_favorites).values([
				{ profile_id: actors.buyer.profile.id, item_id: item.id },
				{ profile_id: actors.outsider.profile.id, item_id: item.id },
			]);

			const response = await handleFavorite(actors.buyer.jar, 'remove', item.id);

			expect(response.status).toBe(200);
			expect(await response.json()).toBe(false);
			expect(await favoriteRows(actors.buyer.profile.id, item.id)).toEqual([]);
			expect(await favoriteRows(actors.outsider.profile.id, item.id)).toHaveLength(1);
		});

		it('defines repeated and absent remove as idempotent false responses', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			await handleFavorite(actors.buyer.jar, 'add', item.id);

			const first = await handleFavorite(actors.buyer.jar, 'remove', item.id);
			const repeated = await handleFavorite(actors.buyer.jar, 'remove', item.id);
			const absent = await handleFavorite(actors.buyer.jar, 'remove', 2_147_483_647);

			for (const response of [first, repeated, absent]) {
				expect(response.status).toBe(200);
				expect(await response.json()).toBe(false);
			}
			expect(await favoriteRows(actors.buyer.profile.id, item.id)).toEqual([]);
		});
	});
});
