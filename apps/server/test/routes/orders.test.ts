import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import { items, orders } from '../../src/database/schemas/schema';
import { createCommerceActors, createItemFixture, createOrderFixture } from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';

describe('order routes', () => {
	it.each([['/orders/auth/status/all'], ['/orders/auth/1']])('requires authentication for GET %s', async (path) => {
		const response = await app.request(path);
		expect(response.status).toBe(401);
	});

	it('returns an empty order list for a profile with no orders', async () => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest('/orders/auth/status/all', 'GET', actors.buyer.jar);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it.each(Object.values(ORDER_PHASES))('filters %s orders for both buyer and seller by profile id', async (status) => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const order = await createOrderFixture(actors, item, { status });
		const otherItem = await createItemFixture(actors, {
			commons: { title: `Other ${status.replaceAll('_', ' ')} item` },
		});
		const outsiderOrder = await createOrderFixture(actors, otherItem, {
			buyer_id: actors.outsider.profile.id,
			buyer_address: actors.outsider.address.id,
			status,
		});

		for (const [actor, expectedIds] of [
			[actors.buyer, [order.id]],
			[actors.seller, [order.id, outsiderOrder.id]],
		] as const) {
			const response = await authenticatedRequest(`/orders/auth/status/${status}`, 'GET', actor.jar);
			expect(response.status).toBe(200);
			const body = (await response.json()) as Array<{
				id: number;
				status: string;
				item: { id: number; title: string };
			}>;
			expect(body.map(({ id }) => id).sort((left, right) => left - right)).toEqual(
				[...expectedIds].sort((left, right) => left - right),
			);
			expect(body.find(({ id }) => id === order.id)).toMatchObject({
				id: order.id,
				status,
				item: { id: item.id, title: item.title },
			});
		}

		const outsiderResponse = await authenticatedRequest(`/orders/auth/status/${status}`, 'GET', actors.outsider.jar);
		expect(outsiderResponse.status).toBe(200);
		const outsiderBody = (await outsiderResponse.json()) as Array<{ id: number }>;
		expect(outsiderBody).toHaveLength(1);
		expect(outsiderBody[0]?.id).toBe(outsiderOrder.id);
	});

	it('returns all statuses without exposing unrelated orders', async () => {
		const actors = await createCommerceActors();
		const pendingItem = await createItemFixture(actors);
		const completedItem = await createItemFixture(actors, { commons: { title: 'Completed order item' } });
		const outsiderItem = await createItemFixture(actors, { commons: { title: 'Outsider order item' } });
		const pending = await createOrderFixture(actors, pendingItem);
		const completed = await createOrderFixture(actors, completedItem, { status: ORDER_PHASES.COMPLETED });
		await createOrderFixture(actors, outsiderItem, {
			buyer_id: actors.outsider.profile.id,
			buyer_address: actors.outsider.address.id,
		});

		const response = await authenticatedRequest('/orders/auth/status/all', 'GET', actors.buyer.jar);
		expect(response.status).toBe(200);
		const body = (await response.json()) as Array<{ id: number }>;
		expect(body.map(({ id }) => id).sort((left, right) => left - right)).toEqual(
			[pending.id, completed.id].sort((left, right) => left - right),
		);
	});

	it('exposes a correctly encoded payment action and immutable sale price only to the buyer', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const order = await createOrderFixture(actors, item, {
			item_price: 9_000,
			payment_transaction_id: 91_337,
			payment_creation_state: 'created',
		});
		const { db } = getTestDatabase();
		await db.update(items).set({ price: 42_000 }).where(eq(items.id, item.id));

		const buyerResponse = await authenticatedRequest('/orders/auth/status/all', 'GET', actors.buyer.jar);
		const [buyerOrder] = (await buyerResponse.json()) as Array<Record<string, unknown>>;
		expect(buyerOrder).toMatchObject({
			id: order.id,
			original_price: 9_000,
			payment_transaction_id: 91_337,
			payment_url:
				'http://trustap.test/online/transactions/91337/guest_pay?redirect_uri=http%3A%2F%2Fstorefront.test%2Fauth%2Fprofile%2Forders%3Fhighlight%3D1',
		});

		const sellerResponse = await authenticatedRequest('/orders/auth/status/all', 'GET', actors.seller.jar);
		const [sellerOrder] = (await sellerResponse.json()) as Array<Record<string, unknown>>;
		expect(sellerOrder).not.toHaveProperty('payment_url');
		for (const internalField of [
			'payment_attempt_id',
			'payment_creation_state',
			'payment_cancellation_state',
			'legacy_payment_transaction_id',
			'payment_transaction_id',
		]) {
			expect(sellerOrder).not.toHaveProperty(internalField);
		}

		const buyerDetail = (await (
			await authenticatedRequest(`/orders/auth/${order.id}`, 'GET', actors.buyer.jar)
		).json()) as Record<string, unknown>;
		expect(buyerDetail.payment_url).toBe(buyerOrder?.payment_url);
		const sellerDetail = (await (
			await authenticatedRequest(`/orders/auth/${order.id}`, 'GET', actors.seller.jar)
		).json()) as Record<string, unknown>;
		expect(sellerDetail).not.toHaveProperty('payment_url');
		for (const internalField of [
			'payment_attempt_id',
			'payment_creation_state',
			'payment_cancellation_state',
			'legacy_payment_transaction_id',
			'payment_transaction_id',
		]) {
			expect(sellerDetail).not.toHaveProperty(internalField);
		}
	});

	it.each([
		{ payment_creation_state: 'reconciliation_required' },
		{ payment_cancellation_state: 'reconciliation_required' },
		{ status: ORDER_PHASES.PAYMENT_CONFIRMED },
	] as const)('withholds the buyer payment action unless the order is exactly payable: %j', async (override) => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const order = await createOrderFixture(actors, item, {
			payment_transaction_id: 91_337,
			payment_creation_state: 'created',
			...override,
		});

		const response = await authenticatedRequest(`/orders/auth/${order.id}`, 'GET', actors.buyer.jar);
		expect(response.status).toBe(200);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body).not.toHaveProperty('payment_url');
		expect(body).not.toHaveProperty('payment_transaction_id');
	});

	it.each(['unknown', 'PAYMENT_PENDING'])('rejects invalid status %j', async (status) => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest(`/orders/auth/status/${status}`, 'GET', actors.buyer.jar);
		expect(response.status).toBe(400);
	});

	it('returns order detail only to its buyer and seller', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const order = await createOrderFixture(actors, item);

		for (const actor of [actors.buyer, actors.seller]) {
			const response = await authenticatedRequest(`/orders/auth/${order.id}`, 'GET', actor.jar);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				id: order.id,
				item_id: item.id,
				buyer_id: actors.buyer.profile.id,
				seller_id: actors.seller.profile.id,
			});
		}

		const outsiderResponse = await authenticatedRequest(`/orders/auth/${order.id}`, 'GET', actors.outsider.jar);
		expect(outsiderResponse.status).toBe(404);
	});

	it.each(['missing', '0', '-1', '1.5', '2147483648'])('rejects malformed order id %s', async (id) => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest(`/orders/auth/${id}`, 'GET', actors.buyer.jar);
		expect(response.status).toBe(400);
	});

	it('returns 404 for an absent numeric order without leaking another resource', async () => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest('/orders/auth/2147483647', 'GET', actors.buyer.jar);
		expect(response.status).toBe(404);

		const { db } = getTestDatabase();
		expect(await db.select().from(orders).where(eq(orders.buyer_id, actors.buyer.profile.id))).toEqual([]);
	});
});
