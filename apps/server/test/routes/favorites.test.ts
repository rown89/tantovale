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

const FAVORITE_INSERT_BARRIER_FIRST_KEY = 1_907_801_438;
const FAVORITE_INSERT_BARRIER_SECOND_KEY = 1_393_617_629;

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

async function waitForAdvisoryLockWaiter(connection: PoolClient): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const { rows } = await connection.query<{ waiting: number }>(`
			SELECT count(*)::int AS waiting
			FROM pg_stat_activity
			WHERE datname = current_database()
				AND wait_event_type = 'Lock'
				AND wait_event = 'advisory'
		`);
		if ((rows[0]?.waiting ?? 0) > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('Timed out waiting for a favorite advisory-lock waiter');
}

describe('favorite routes', () => {
	describe('GET /favorites/auth/check/:item_id', () => {
		it('requires authentication', async () => {
			const response = await app.request('/favorites/auth/check/1');

			expect(response.status).toBe(401);
		});

		it.each(['not-a-number', '0', '-1', '1.5', '2147483648'])('rejects malformed item ID %s', async (itemId) => {
			const actors = await createCommerceActors();
			const response = await authenticatedRequest(`/favorites/auth/check/${itemId}`, 'GET', actors.buyer.jar);

			expect(response.status).toBe(400);
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

		it('serializes concurrent duplicate adds before checking and inserting', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client } = getTestDatabase();
			const barrierConnection = await client.connect();

			try {
				await barrierConnection.query(`
					CREATE FUNCTION test_block_favorite_insert() RETURNS trigger AS $$
					BEGIN
						PERFORM pg_advisory_xact_lock(
							${FAVORITE_INSERT_BARRIER_FIRST_KEY},
							${FAVORITE_INSERT_BARRIER_SECOND_KEY}
						);
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
				await barrierConnection.query('SELECT pg_advisory_xact_lock($1, $2)', [
					FAVORITE_INSERT_BARRIER_FIRST_KEY,
					FAVORITE_INSERT_BARRIER_SECOND_KEY,
				]);

				const responsesPromise = Promise.all(
					Array.from({ length: 12 }, () => handleFavorite(actors.buyer.jar, 'add', item.id)),
				);
				await waitForAdvisoryLockWaiter(barrierConnection);
				await new Promise((resolve) => setTimeout(resolve, 100));
				await barrierConnection.query('COMMIT');

				const responses = await responsesPromise;
				expect(responses.map(({ status }) => status)).toEqual(Array.from({ length: 12 }, () => 200));
				expect(await Promise.all(responses.map((response) => response.json()))).toEqual(
					Array.from({ length: 12 }, () => true),
				);
				expect(await favoriteRows(actors.buyer.profile.id, item.id)).toHaveLength(1);
			} finally {
				await barrierConnection.query('ROLLBACK');
				await barrierConnection.query('DROP TRIGGER IF EXISTS test_favorite_insert_barrier ON user_items_favorites');
				await barrierConnection.query('DROP FUNCTION IF EXISTS test_block_favorite_insert()');
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
