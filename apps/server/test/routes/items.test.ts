import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import {
	addresses,
	categories,
	items,
	items_properties_values,
	orders,
	profiles,
	profiles_items_favorites,
	properties,
	property_values,
	subcategories,
	subcategory_properties,
} from '../../src/database/schemas/schema';
import { itemStatus, ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import { createItemSchema, updateItemSchema } from '../../src/extended_schemas/item';
import { environment } from '../../src/utils/constants';
import { createAddressFixture } from '../fixtures/addresses';
import {
	createCommerceActors,
	createImageFixture,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
	validItemBody,
	type CommerceActorGraph,
} from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { getProviderRequests } from '../helpers/providers';
import type { CookieJar } from '../helpers/request';

type JsonObject = Record<string, unknown>;

async function responseJson(response: Response): Promise<JsonObject> {
	return (await response.json()) as JsonObject;
}

async function authJson(path: string, method: string, jar: CookieJar, body?: unknown): Promise<Response> {
	return authenticatedRequest(path, method, jar, body);
}

function withDelivery(actors: CommerceActorGraph, valueId: number, easyPay = false) {
	const body = validItemBody(actors, { commons: { easy_pay: easyPay } });
	return {
		...body,
		properties: body.properties?.map((property) =>
			property.id === actors.catalog.delivery.property.id ? { ...property, value: valueId } : property,
		),
	};
}

async function expectNoPaymentProviderRequests(): Promise<void> {
	const providerUrl = environment.PAYMENT_PROVIDER_API_URL;
	if (!providerUrl) throw new Error('Missing worker-local Trustap stub URL');
	expect(await getProviderRequests(providerUrl)).toEqual([]);
}

async function waitForPaymentProviderRequests(expectedCount: number): Promise<void> {
	const providerUrl = environment.PAYMENT_PROVIDER_API_URL;
	if (!providerUrl) throw new Error('Missing worker-local Trustap stub URL');
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const requests = await getProviderRequests(providerUrl);
		if (requests.filter(({ path }) => path === '/api/v1/guest_users').length >= expectedCount) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`Timed out waiting for ${expectedCount} payment-provider guest request(s)`);
}

async function createOptionalCardinalityProperty(
	actors: CommerceActorGraph,
	type: 'select' | 'radio' | 'select_multi' | 'checkbox',
) {
	const { db } = getTestDatabase();
	const [property] = await db
		.insert(properties)
		.values({
			name: `Cardinality ${type}`,
			slug: `cardinality-${type}-${actors.seller.user.id}`,
			type,
		})
		.returning();
	if (!property) throw new Error('Cardinality property insert failed');
	await db.insert(subcategory_properties).values({
		property_id: property.id,
		subcategory_id: actors.catalog.childSubcategory.id,
		on_item_create_required: false,
		on_item_update_editable: true,
	});
	const [value] = await db
		.insert(property_values)
		.values({ property_id: property.id, name: 'Cardinality value', value: 'cardinality-value' })
		.returning();
	if (!value) throw new Error('Cardinality property value insert failed');
	return { property, value };
}

function hiddenTaxonomyItemBody(actors: CommerceActorGraph) {
	const body = validItemBody(actors, {
		commons: {
			easy_pay: false,
			subcategory_id: actors.catalog.unpublishedSubcategory.id,
		},
		properties: [
			{
				id: actors.catalog.unpublishedMapping.property.id,
				slug: actors.catalog.unpublishedMapping.property.slug,
				value: actors.catalog.unpublishedMapping.propertyValue.id,
			},
		],
	});
	return { ...body, shipping: undefined };
}

async function waitForBlockedItemUpdate(): Promise<void> {
	const { client } = getTestDatabase();
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const { rows } = await client.query<{ blocked: boolean }>(`
			SELECT EXISTS (
				SELECT 1
				FROM pg_stat_activity
				WHERE datname = current_database()
					AND wait_event_type = 'Lock'
					AND query ILIKE 'update "items" set%'
			) AS blocked
		`);
		if (rows[0]?.blocked) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('Timed out waiting for the item edit UPDATE to block on the deterministic row lock');
}

describe('item and listing routes', () => {
	describe('GET /item/:id', () => {
		it('returns a public published item with its relations and original images', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const original = await createImageFixture(item.id, 'original');
			await createImageFixture(item.id, 'thumbnail');

			const response = await app.request(`/item/${item.id}`);
			const body = await responseJson(response);

			expect(response.status).toBe(200);
			expect(body).toMatchObject({
				id: item.id,
				title: item.title,
				price: item.price,
				user: { id: actors.seller.profile.id, username: actors.seller.user.username },
				location: {
					city: { id: actors.catalog.city.id, name: actors.catalog.city.name },
					province: { id: actors.catalog.city.id, name: actors.catalog.city.name },
				},
				subcategory: {
					name: actors.catalog.childSubcategory.name,
					slug: actors.catalog.childSubcategory.slug,
				},
				order: { id: null },
				orderProposal: { id: null },
			});
			expect(body.images).toEqual([original.url]);
			expect(body.properties).toHaveLength(4);
		});

		it('projects only the authenticated buyer pending proposal and order', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const proposal = await createProposalFixture(actors, item);
			const order = await createOrderFixture(actors, item);
			await createProposalFixture(actors, item, {
				profile_id: actors.outsider.profile.id,
				status: 'pending',
			});

			const response = await authJson(`/item/${item.id}`, 'GET', actors.buyer.jar);
			const body = await responseJson(response);

			expect(response.status).toBe(200);
			expect(body.order).toMatchObject({ id: order.id, status: ORDER_PHASES.PAYMENT_PENDING });
			expect(body.orderProposal).toMatchObject({ id: proposal.id, status: 'pending' });
		});

		it.each(['/item/not-a-number', '/item/0', '/item/-1'])('returns 400 for malformed item ID %s', async (path) => {
			const response = await app.request(path);
			expect(response.status).toBe(400);
		});

		it('returns 404 for an absent item', async () => {
			const response = await app.request('/item/2147483647');
			expect(response.status).toBe(404);
		});

		it('returns 404 for an unpublished item', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors, { commons: { title: 'Hidden Commerce Item' } });
			const { db } = getTestDatabase();
			await db.update(items).set({ published: false }).where(eq(items.id, item.id));

			const response = await app.request(`/item/${item.id}`);
			expect(response.status).toBe(404);
		});

		it('treats malformed optional authentication cookies as a guest', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			await createProposalFixture(actors, item);
			await createOrderFixture(actors, item);

			const response = await app.request(`/item/${item.id}`, {
				headers: { cookie: 'access_token=malformed; refresh_token=also-malformed' },
			});
			const body = await responseJson(response);

			expect(response.status).toBe(200);
			expect(body.order).toEqual({ id: null });
			expect(body.orderProposal).toEqual({ id: null });
		});
	});

	describe('POST /item/auth/new', () => {
		it('accepts the real storefront shape and strips its UI-only commons.city field', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors) as ReturnType<typeof validItemBody> & {
				commons: Record<string, unknown>;
			};
			body.commons.city = 0;

			const parsed = createItemSchema.safeParse(body);
			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			const responseBody = await responseJson(response);

			expect(parsed.success).toBe(true);
			if (!parsed.success) throw new Error('Storefront-shaped item payload should parse');
			expect(parsed.data.commons).not.toHaveProperty('city');
			expect(response.status).toBe(201);
			const { db } = getTestDatabase();
			const [stored] = await db
				.select()
				.from(items)
				.where(eq(items.id, Number(responseBody.item_id)));
			expect(stored?.id).toBe(Number(responseBody.item_id));
		});

		it('creates the item and all property joins atomically', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors);
			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			const responseBody = await responseJson(response);
			const itemId = Number(responseBody.item_id);
			const { db } = getTestDatabase();
			const [storedItem] = await db.select().from(items).where(eq(items.id, itemId));
			const storedProperties = await db
				.select()
				.from(items_properties_values)
				.where(eq(items_properties_values.item_id, itemId));

			expect(response.status).toBe(201);
			expect(responseBody).toEqual({ message: 'Item created successfully', item_id: itemId });
			expect(storedItem).toMatchObject({
				...body.commons,
				id: itemId,
				profile_id: actors.seller.profile.id,
				published: true,
				status: itemStatus.AVAILABLE,
			});
			const propertyById = new Map(body.properties?.map((property) => [property.id, property]));
			expect(propertyById.get(actors.catalog.properties.text.id)?.value).toBe(actors.catalog.propertyValues.text.id);
			expect(propertyById.get(actors.catalog.properties.numeric.id)?.value).toBe(0);
			expect(propertyById.get(actors.catalog.properties.boolean.id)?.value).toBe(false);
			expect(propertyById.get(actors.catalog.delivery.property.id)?.value).toBe(
				actors.catalog.delivery.values.easyPay.id,
			);
			expect(storedProperties.map(({ property_value_id }) => property_value_id).sort((a, b) => a - b)).toEqual(
				[...Object.values(actors.catalog.propertyValues), actors.catalog.delivery.values.easyPay]
					.map(({ id }) => id)
					.sort((a, b) => a - b),
			);
		});

		it('uses only the authenticated profile active address when provisioning Easy Pay', async () => {
			const actors = await createCommerceActors();
			const { db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));
			await db.update(addresses).set({ status: 'inactive' }).where(eq(addresses.id, actors.seller.address.id));
			const sellerActiveAddress = await createAddressFixture(actors.seller.profile.id, {
				label: 'Seller active replacement',
				status: 'active',
				country_code: 'DE',
			});
			const body = validItemBody(actors, { commons: { address_id: sellerActiveAddress.id } });

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			const providerUrl = environment.PAYMENT_PROVIDER_API_URL;
			if (!providerUrl) throw new Error('Missing worker-local Trustap stub URL');
			const requests = await getProviderRequests(providerUrl);
			const guestRequest = requests.find(({ path }) => path === '/api/v1/guest_users');

			expect(response.status).toBe(201);
			expect(guestRequest?.body).toMatchObject({ id: actors.seller.profile.id, country_code: 'DE' });
		});

		it('serializes concurrent payment identity provisioning to one provider request', async () => {
			const actors = await createCommerceActors();
			const { db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));
			const firstBody = validItemBody(actors, { commons: { title: 'Concurrent Identity Listing One' } });
			const secondBody = validItemBody(actors, { commons: { title: 'Concurrent Identity Listing Two' } });

			const responses = await Promise.all([
				authJson('/item/auth/new', 'POST', actors.seller.jar, firstBody),
				authJson('/item/auth/new', 'POST', actors.seller.jar, secondBody),
			]);
			const providerUrl = environment.PAYMENT_PROVIDER_API_URL;
			if (!providerUrl) throw new Error('Missing worker-local Trustap stub URL');
			const guestRequests = (await getProviderRequests(providerUrl)).filter(
				({ path }) => path === '/api/v1/guest_users',
			);
			const storedItems = await db.select().from(items);
			const [storedProfile] = await db.select().from(profiles).where(eq(profiles.id, actors.seller.profile.id));

			expect(responses.map(({ status }) => status)).toEqual([201, 201]);
			expect(guestRequests).toHaveLength(1);
			expect(storedItems).toHaveLength(2);
			expect(storedProfile?.payment_provider_id).toBeTruthy();
		});

		it('durably persists a provider identity when the later local item transaction rolls back', async () => {
			const actors = await createCommerceActors();
			const { client, db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));
			const blocker = await client.connect();
			let transactionOpen = false;

			try {
				await blocker.query('BEGIN');
				transactionOpen = true;
				await blocker.query('SELECT id FROM addresses WHERE id = $1 FOR UPDATE', [actors.seller.address.id]);
				const createResponsePromise = authJson('/item/auth/new', 'POST', actors.seller.jar, validItemBody(actors));

				await waitForPaymentProviderRequests(1);
				await blocker.query('DELETE FROM addresses WHERE id = $1', [actors.seller.address.id]);
				await blocker.query('COMMIT');
				transactionOpen = false;
				const failedResponse = await createResponsePromise;
				const [durableProfile] = await db.select().from(profiles).where(eq(profiles.id, actors.seller.profile.id));

				expect(failedResponse.status).toBe(400);
				expect(await db.select().from(items)).toEqual([]);
				expect(durableProfile?.payment_provider_id).toBeTruthy();

				const replacementAddress = await createAddressFixture(actors.seller.profile.id, {
					label: 'Durable identity retry address',
					status: 'active',
				});
				const retryResponse = await authJson(
					'/item/auth/new',
					'POST',
					actors.seller.jar,
					validItemBody(actors, { commons: { address_id: replacementAddress.id } }),
				);
				const providerUrl = environment.PAYMENT_PROVIDER_API_URL;
				if (!providerUrl) throw new Error('Missing worker-local Trustap stub URL');
				const guestRequests = (await getProviderRequests(providerUrl)).filter(
					({ path }) => path === '/api/v1/guest_users',
				);

				expect(retryResponse.status).toBe(201);
				expect(guestRequests).toHaveLength(1);
			} finally {
				if (transactionOpen) await blocker.query('ROLLBACK');
				blocker.release();
			}
		});

		it('strips raw item storage shipping fields so pickup cannot be bypassed', async () => {
			const actors = await createCommerceActors();
			const body = withDelivery(actors, actors.catalog.delivery.values.pickup.id) as ReturnType<typeof withDelivery> & {
				commons: Record<string, unknown>;
			};
			body.shipping = {
				item_height: 0,
				item_length: 0,
				item_weight: 0,
				item_width: 0,
				shipping_price: 0,
			};
			body.commons.custom_shipping_price = 9_999;
			body.commons.item_weight = 9_999;
			body.commons.item_length = 9_999;
			body.commons.item_width = 9_999;
			body.commons.item_height = 9_999;
			const { db } = getTestDatabase();
			const parsed = createItemSchema.parse(body);

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			const responseBody = await responseJson(response);
			const [stored] = await db
				.select()
				.from(items)
				.where(eq(items.id, Number(responseBody.item_id)));

			expect(parsed.commons).not.toHaveProperty('custom_shipping_price');
			expect(parsed.commons).not.toHaveProperty('item_weight');
			expect(parsed.commons).not.toHaveProperty('item_length');
			expect(parsed.commons).not.toHaveProperty('item_width');
			expect(parsed.commons).not.toHaveProperty('item_height');
			expect(response.status).toBe(201);
			expect(stored).toMatchObject({
				custom_shipping_price: null,
				item_weight: null,
				item_length: null,
				item_width: null,
				item_height: null,
			});
			await expectNoPaymentProviderRequests();
		});

		it.each(['select', 'radio', 'select_multi', 'checkbox'] as const)(
			'rejects an invalid %s property cardinality before creating side effects',
			async (type) => {
				const actors = await createCommerceActors();
				const optional = await createOptionalCardinalityProperty(actors, type);
				const body = validItemBody(actors);
				const requiresArray = type === 'select_multi' || type === 'checkbox';
				body.properties = [
					...(body.properties ?? []),
					{
						id: optional.property.id,
						slug: optional.property.slug,
						value: requiresArray ? optional.value.id : [optional.value.id],
					},
				];
				const { db } = getTestDatabase();
				await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));

				const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

				expect(response.status).toBe(400);
				expect(await responseJson(response)).toEqual({
					message: requiresArray
						? `Property ${optional.property.slug} requires a nonempty array of property-value IDs`
						: `Property ${optional.property.slug} requires exactly one scalar property-value ID`,
				});
				expect(await db.select().from(items)).toEqual([]);
				expect(await db.select().from(items_properties_values)).toEqual([]);
				await expectNoPaymentProviderRequests();
			},
		);

		it('rejects duplicate property IDs before contradictory delivery methods can create side effects', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors);
			body.properties = [
				...(body.properties ?? []),
				{
					id: actors.catalog.delivery.property.id,
					slug: actors.catalog.delivery.property.slug,
					value: [actors.catalog.delivery.values.pickup.id],
				},
			];
			const { db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			expect(await responseJson(response)).toEqual({ message: 'Each property can be supplied only once' });
			expect(await db.select().from(items)).toEqual([]);
			expect(await db.select().from(items_properties_values)).toEqual([]);
			await expectNoPaymentProviderRequests();
		});

		it.each(['subcategory', 'category'] as const)(
			'rejects create when the target %s is hidden using an otherwise valid non-Easy-Pay payload',
			async (hiddenNode) => {
				const actors = await createCommerceActors();
				const { db } = getTestDatabase();
				if (hiddenNode === 'subcategory') {
					await db
						.update(categories)
						.set({ published: true })
						.where(eq(categories.id, actors.catalog.unpublishedCategory.id));
				} else {
					await db
						.update(subcategories)
						.set({ published: true })
						.where(eq(subcategories.id, actors.catalog.unpublishedSubcategory.id));
				}

				const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, hiddenTaxonomyItemBody(actors));

				expect(response.status).toBe(400);
				expect(await responseJson(response)).toEqual({ message: 'Subcategory is not publicly available' });
				expect(await db.select().from(items)).toEqual([]);
				await expectNoPaymentProviderRequests();
			},
		);

		it.each([
			[
				'fractional price',
				(body: ReturnType<typeof validItemBody>): void => {
					body.commons.price = 12_000.5;
				},
			],
			[
				'negative shipping price',
				(body: ReturnType<typeof validItemBody>): void => {
					body.shipping!.shipping_price = -1;
				},
			],
			[
				'out-of-int4 shipping weight',
				(body: ReturnType<typeof validItemBody>): void => {
					body.shipping!.item_weight = 2_147_483_648;
				},
			],
			[
				'fractional shipping height',
				(body: ReturnType<typeof validItemBody>): void => {
					body.shipping!.item_height = 1.5;
				},
			],
		] as const)('rejects %s before contacting the payment provider', async (_label, mutateBody) => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors);
			mutateBody(body);
			const { db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			expect(await db.select().from(items)).toEqual([]);
			await expectNoPaymentProviderRequests();
		});

		it('rejects an out-of-int4 raw numeric property before contacting the payment provider', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors);
			body.properties = body.properties?.map((property) =>
				property.id === actors.catalog.properties.numeric.id ? { ...property, value: 2_147_483_648 } : property,
			);
			const { db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			expect(await db.select().from(items)).toEqual([]);
			await expectNoPaymentProviderRequests();
		});

		it('rejects an out-of-int4 select ID before contacting the payment provider', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors);
			body.properties = body.properties?.map((property) =>
				property.id === actors.catalog.properties.text.id ? { ...property, value: '2147483648' } : property,
			);
			const { db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			expect(await responseJson(response)).toEqual({
				message: `Property ${actors.catalog.properties.text.slug} requires 32-bit property-value IDs`,
			});
			await expectNoPaymentProviderRequests();
		});

		it.each(['address_id', 'subcategory_id', 'property_id'] as const)(
			'rejects an out-of-int4 %s in the public create schema',
			async (field) => {
				const actors = await createCommerceActors();
				const body = validItemBody(actors);
				if (field === 'property_id') {
					body.properties = body.properties?.map((property, index) =>
						index === 0 ? { ...property, id: 2_147_483_648 } : property,
					);
				} else {
					body.commons[field] = 2_147_483_648;
				}

				expect(createItemSchema.safeParse(body).success).toBe(false);
				const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
				expect(response.status).toBe(400);
				await expectNoPaymentProviderRequests();
			},
		);

		it('rejects an inactive address owned by the authenticated profile without persisting', async () => {
			const actors = await createCommerceActors();
			const inactiveAddress = await createAddressFixture(actors.seller.profile.id, {
				label: 'Inactive listing address',
				status: 'inactive',
			});
			const body = validItemBody(actors, { commons: { address_id: inactiveAddress.id } });
			const { db } = getTestDatabase();

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			expect(await db.select().from(items)).toEqual([]);
			await expectNoPaymentProviderRequests();
		});

		it('rejects Easy Pay for a subcategory that does not support it', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors, {
				commons: { subcategory_id: actors.catalog.unpublishedSubcategory.id },
				properties: [
					{
						id: actors.catalog.unpublishedMapping.property.id,
						slug: actors.catalog.unpublishedMapping.property.slug,
						value: actors.catalog.unpublishedMapping.propertyValue.id,
					},
				],
			});

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			await expectNoPaymentProviderRequests();
		});

		it.each([
			['Easy Pay with pickup', true, 'pickup', 0],
			['Easy Pay with manual shipping', true, 'shipping', 1_250],
			['manual checkout with Easy Pay shipping', false, 'easyPay', 0],
		] as const)('rejects inconsistent delivery mode: %s', async (_label, easyPay, deliveryKey, shippingPrice) => {
			const actors = await createCommerceActors();
			const body = withDelivery(actors, actors.catalog.delivery.values[deliveryKey].id, easyPay);
			body.shipping = { ...body.shipping, shipping_price: shippingPrice };

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			await expectNoPaymentProviderRequests();
		});

		it('rejects pickup when a shipping price is supplied without persisting an item', async () => {
			const actors = await createCommerceActors();
			const body = withDelivery(actors, actors.catalog.delivery.values.pickup.id);
			body.shipping = { ...body.shipping, shipping_price: 1_250 };
			const { db } = getTestDatabase();

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			const stored = await db.select().from(items);

			expect(response.status).toBe(400);
			expect(stored).toEqual([]);
			await expectNoPaymentProviderRequests();
		});

		it.each(['shipping_price', 'item_weight', 'item_length', 'item_width', 'item_height'] as const)(
			'rejects shipping when %s is missing or zero',
			async (field) => {
				const actors = await createCommerceActors();
				const body = withDelivery(actors, actors.catalog.delivery.values.shipping.id);
				body.shipping = { ...body.shipping, [field]: 0 };

				const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
				expect(response.status).toBe(400);
				await expectNoPaymentProviderRequests();
			},
		);

		it('rejects an unknown property after all required properties pass validation', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors);
			body.properties = [...(body.properties ?? []), { id: 2_147_483_647, slug: 'unknown', value: 2_147_483_647 }];
			const { db } = getTestDatabase();

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			expect(await responseJson(response)).toEqual({
				message: 'Some properties are not mapped to this subcategory',
			});
			expect(await db.select().from(items)).toEqual([]);
			await expectNoPaymentProviderRequests();
		});

		it.each([
			[
				'mismapped property value',
				(actors: CommerceActorGraph) => [
					...(validItemBody(actors).properties ?? []),
					{
						id: actors.catalog.unpublishedMapping.property.id,
						slug: actors.catalog.unpublishedMapping.property.slug,
						value: actors.catalog.unpublishedMapping.propertyValue.id,
					},
				],
			],
			[
				'omitted required property',
				(actors: CommerceActorGraph) => validItemBody(actors).properties?.slice(0, 2) ?? [],
			],
		] as const)('rejects an %s and rolls back the item', async (_label, propertyBuilder) => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors);
			body.properties = propertyBuilder(actors);
			const { db } = getTestDatabase();

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			const stored = await db.select().from(items);

			expect(response.status).toBe(400);
			expect(stored).toEqual([]);
		});

		it('rejects a value that belongs to a different mapped property', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors);
			body.properties = (body.properties ?? []).map((property, index) =>
				index === 0 ? { ...property, value: actors.catalog.propertyValues.numeric.id } : property,
			);

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			expect(response.status).toBe(400);
			await expectNoPaymentProviderRequests();
		});

		it.each([
			[
				'boolean option ID instead of raw boolean',
				'boolean',
				(actors: CommerceActorGraph) => actors.catalog.propertyValues.boolean.id,
			],
			['numeric string instead of raw number', 'numeric', () => '0'],
			['raw boolean instead of select option ID', 'text', () => false],
			[
				'accidental numeric collision with another option ID',
				'numeric',
				(actors: CommerceActorGraph) => actors.catalog.propertyValues.text.id,
			],
			['missing numeric semantic value', 'numeric', () => 9_999_999],
		] as const)('rejects %s', async (_label, propertyKey, valueBuilder) => {
			const actors = await createCommerceActors();
			const propertyId = actors.catalog.properties[propertyKey].id;
			const body = validItemBody(actors);
			body.properties = body.properties?.map((property) =>
				property.id === propertyId ? { ...property, value: valueBuilder(actors) } : property,
			);

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);

			expect(response.status).toBe(400);
			await expectNoPaymentProviderRequests();
		});

		it('rejects an ambiguous raw numeric value', async () => {
			const actors = await createCommerceActors();
			const { db } = getTestDatabase();
			await db.insert(property_values).values({
				property_id: actors.catalog.properties.numeric.id,
				name: 'Ambiguous zero',
				numeric_value: 0,
				value: 'ambiguous-zero',
			});

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, validItemBody(actors));

			expect(response.status).toBe(400);
			expect(await db.select().from(items)).toEqual([]);
			await expectNoPaymentProviderRequests();
		});

		it('rejects an address owned by another profile', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors, { commons: { address_id: actors.buyer.address.id } });

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			expect(response.status).toBe(400);
			await expectNoPaymentProviderRequests();
		});
	});

	describe('PUT /item/auth/edit/:id', () => {
		it('lets the owner update mutable fields, address, and replace property joins transactionally', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db.update(addresses).set({ status: 'inactive' }).where(eq(addresses.id, actors.seller.address.id));
			const replacementAddress = await createAddressFixture(actors.seller.profile.id, {
				label: 'Warehouse',
				status: 'active',
			});
			const [replacementTextValue] = await db
				.insert(property_values)
				.values({ property_id: actors.catalog.properties.text.id, name: 'Wool', value: 'wool' })
				.returning();
			if (!replacementTextValue) throw new Error('Replacement property value insert failed');
			const propertiesBody = [
				{
					id: actors.catalog.properties.text.id,
					slug: actors.catalog.properties.text.slug,
					value: replacementTextValue.id,
				},
				{
					id: actors.catalog.properties.numeric.id,
					slug: actors.catalog.properties.numeric.slug,
					value: 0,
				},
				{
					id: actors.catalog.properties.boolean.id,
					slug: actors.catalog.properties.boolean.slug,
					value: false,
				},
				{
					id: actors.catalog.delivery.property.id,
					slug: actors.catalog.delivery.property.slug,
					value: actors.catalog.delivery.values.easyPay.id,
				},
			];

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				commons: { title: 'Updated Commerce Listing', price: 15_500, address_id: replacementAddress.id },
				properties: propertiesBody,
			});
			const responseBody = await responseJson(response);
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));
			const joins = await db.select().from(items_properties_values).where(eq(items_properties_values.item_id, item.id));

			expect(response.status).toBe(200);
			expect(responseBody).toEqual({ message: 'Item updated successfully', item_id: item.id });
			expect(stored).toMatchObject({
				id: item.id,
				profile_id: actors.seller.profile.id,
				title: 'Updated Commerce Listing',
				price: 15_500,
				address_id: replacementAddress.id,
			});
			expect(joins.map(({ property_value_id }) => property_value_id).sort((a, b) => a - b)).toEqual(
				[
					replacementTextValue.id,
					actors.catalog.propertyValues.numeric.id,
					actors.catalog.propertyValues.boolean.id,
					actors.catalog.delivery.values.easyPay.id,
				].sort((a, b) => a - b),
			);
		});

		it('allows a partial common-field update without replacing properties', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			const before = await db
				.select({ property_value_id: items_properties_values.property_value_id })
				.from(items_properties_values)
				.where(eq(items_properties_values.item_id, item.id));

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				commons: {
					description: 'An updated deterministic description that remains comfortably above the minimum length.',
				},
			});
			const after = await db
				.select({ property_value_id: items_properties_values.property_value_id })
				.from(items_properties_values)
				.where(eq(items_properties_values.item_id, item.id));

			expect(response.status).toBe(200);
			expect(after).toEqual(before);
		});

		it.each(['select', 'radio', 'select_multi', 'checkbox'] as const)(
			'rejects an invalid %s property cardinality before edit side effects',
			async (type) => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				const optional = await createOptionalCardinalityProperty(actors, type);
				const body = validItemBody(actors);
				const requiresArray = type === 'select_multi' || type === 'checkbox';
				body.properties = [
					...(body.properties ?? []),
					{
						id: optional.property.id,
						slug: optional.property.slug,
						value: requiresArray ? optional.value.id : [optional.value.id],
					},
				];
				const { db } = getTestDatabase();
				await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));
				const beforeJoins = await db
					.select()
					.from(items_properties_values)
					.where(eq(items_properties_values.item_id, item.id));

				const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
					commons: { title: 'Cardinality Must Not Update' },
					properties: body.properties,
				});
				const [stored] = await db.select().from(items).where(eq(items.id, item.id));
				const afterJoins = await db
					.select()
					.from(items_properties_values)
					.where(eq(items_properties_values.item_id, item.id));

				expect(response.status).toBe(400);
				expect(await responseJson(response)).toEqual({
					message: requiresArray
						? `Property ${optional.property.slug} requires a nonempty array of property-value IDs`
						: `Property ${optional.property.slug} requires exactly one scalar property-value ID`,
				});
				expect(stored?.title).toBe(item.title);
				expect(afterJoins).toEqual(beforeJoins);
				await expectNoPaymentProviderRequests();
			},
		);

		it('rejects duplicate property IDs before a contradictory delivery edit can mutate anything', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const body = validItemBody(actors);
			body.properties = [
				...(body.properties ?? []),
				{
					id: actors.catalog.delivery.property.id,
					slug: actors.catalog.delivery.property.slug,
					value: [actors.catalog.delivery.values.pickup.id],
				},
			];
			const { db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));
			const beforeJoins = await db
				.select()
				.from(items_properties_values)
				.where(eq(items_properties_values.item_id, item.id));

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				commons: { title: 'Duplicate Delivery Must Not Update' },
				properties: body.properties,
			});
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));
			const afterJoins = await db
				.select()
				.from(items_properties_values)
				.where(eq(items_properties_values.item_id, item.id));

			expect(response.status).toBe(400);
			expect(await responseJson(response)).toEqual({ message: 'Each property can be supplied only once' });
			expect(stored?.title).toBe(item.title);
			expect(afterJoins).toEqual(beforeJoins);
			await expectNoPaymentProviderRequests();
		});

		it.each(['subcategory', 'category'] as const)(
			'rejects edit when the target %s is hidden using an otherwise valid non-Easy-Pay payload',
			async (hiddenNode) => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				const { db } = getTestDatabase();
				if (hiddenNode === 'subcategory') {
					await db
						.update(categories)
						.set({ published: true })
						.where(eq(categories.id, actors.catalog.unpublishedCategory.id));
				} else {
					await db
						.update(subcategories)
						.set({ published: true })
						.where(eq(subcategories.id, actors.catalog.unpublishedSubcategory.id));
				}
				const hiddenBody = hiddenTaxonomyItemBody(actors);

				const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
					commons: hiddenBody.commons,
					properties: hiddenBody.properties,
				});
				const [stored] = await db.select().from(items).where(eq(items.id, item.id));

				expect(response.status).toBe(400);
				expect(await responseJson(response)).toEqual({ message: 'Subcategory is not publicly available' });
				expect(stored?.subcategory_id).toBe(item.subcategory_id);
				await expectNoPaymentProviderRequests();
			},
		);

		it('merges a partial shipping patch with existing dimensions before validating it', async () => {
			const actors = await createCommerceActors();
			const manualBody = withDelivery(actors, actors.catalog.delivery.values.shipping.id);
			const item = await createItemFixture(actors, {
				commons: { easy_pay: false },
				properties: manualBody.properties,
			});
			const { db } = getTestDatabase();

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				shipping: { shipping_price: 2_000 },
			});
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));

			expect(response.status).toBe(200);
			expect(stored).toMatchObject({
				custom_shipping_price: 2_000,
				item_weight: item.item_weight,
				item_length: item.item_length,
				item_width: item.item_width,
				item_height: item.item_height,
			});
		});

		it.each([
			['another user', false],
			['a deleted item', true],
		] as const)('returns 404 when editing %s', async (_label, deleted) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			if (deleted) {
				const { db } = getTestDatabase();
				await db.update(items).set({ deleted_at: new Date() }).where(eq(items.id, item.id));
			}

			const jar = deleted ? actors.seller.jar : actors.buyer.jar;
			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', jar, {
				commons: { title: 'Forbidden Commerce Edit' },
			});

			expect(response.status).toBe(404);
		});

		it.each(['/item/auth/edit/not-a-number', '/item/auth/edit/0', '/item/auth/edit/-1'])(
			'returns 400 for invalid edit ID %s',
			async (path) => {
				const actors = await createCommerceActors();
				const response = await authJson(path, 'PUT', actors.seller.jar, { commons: { title: 'Valid New Title' } });
				expect(response.status).toBe(400);
			},
		);

		it.each([{}, { commons: {} }, { shipping: {} }])('rejects an update body without mutable values', async (body) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, body);
			expect(response.status).toBe(400);
		});

		it('rejects immutable-only fields and leaves ownership and publication state unchanged', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				profile_id: actors.buyer.profile.id,
				published: false,
				status: itemStatus.SOLD,
				deleted_at: new Date().toISOString(),
			});
			const { db } = getTestDatabase();
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));

			expect(response.status).toBe(400);
			expect(stored).toMatchObject({
				profile_id: actors.seller.profile.id,
				published: true,
				status: itemStatus.AVAILABLE,
				deleted_at: null,
			});
		});

		it('rejects a raw-storage-only edit after stripping it without mutating the item', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const body = {
				commons: {
					custom_shipping_price: 99_999,
					item_weight: 99_999,
					item_length: 99_999,
					item_width: 99_999,
					item_height: 99_999,
				},
			};

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, body);
			const { db } = getTestDatabase();
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));

			expect(response.status).toBe(400);
			expect(stored).toMatchObject({
				title: item.title,
				custom_shipping_price: item.custom_shipping_price,
			});
			await expectNoPaymentProviderRequests();
		});

		it('rejects a replacement address owned by another profile', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				commons: { address_id: actors.buyer.address.id },
			});
			expect(response.status).toBe(400);
		});

		it('rejects an inactive replacement address owned by the seller without mutation', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const inactiveAddress = await createAddressFixture(actors.seller.profile.id, {
				label: 'Inactive edit address',
				status: 'inactive',
			});

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				commons: { address_id: inactiveAddress.id },
			});
			const { db } = getTestDatabase();
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));

			expect(response.status).toBe(400);
			expect(stored?.address_id).toBe(item.address_id);
		});

		it('rejects updates to a property mapping marked non-editable', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db
				.update(subcategory_properties)
				.set({ on_item_update_editable: false })
				.where(eq(subcategory_properties.id, actors.catalog.mappings.text.id));
			const before = await db
				.select()
				.from(items_properties_values)
				.where(eq(items_properties_values.item_id, item.id));

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				properties: validItemBody(actors).properties,
			});
			const after = await db.select().from(items_properties_values).where(eq(items_properties_values.item_id, item.id));

			expect(response.status).toBe(400);
			expect(after).toEqual(before);
		});

		it('rejects an accidental property-value ID collision during edit', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const body = validItemBody(actors);
			body.properties = body.properties?.map((property) =>
				property.id === actors.catalog.properties.numeric.id
					? { ...property, value: actors.catalog.propertyValues.text.id }
					: property,
			);

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				properties: body.properties,
			});

			expect(response.status).toBe(400);
		});

		it('provisions the seller payment identity when edit enables Easy Pay', async () => {
			const actors = await createCommerceActors();
			const manualBody = withDelivery(actors, actors.catalog.delivery.values.shipping.id);
			manualBody.shipping = { ...manualBody.shipping, shipping_price: 1_250 };
			const item = await createItemFixture(actors, {
				commons: { easy_pay: false },
				properties: manualBody.properties,
				shipping: manualBody.shipping,
			});
			const { db } = getTestDatabase();
			await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));
			const easyPayBody = validItemBody(actors);

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				commons: { easy_pay: true },
				properties: easyPayBody.properties,
				shipping: easyPayBody.shipping,
			});
			const providerUrl = environment.PAYMENT_PROVIDER_API_URL;
			if (!providerUrl) throw new Error('Missing worker-local Trustap stub URL');
			const requests = await getProviderRequests(providerUrl);
			const [storedProfile] = await db.select().from(profiles).where(eq(profiles.id, actors.seller.profile.id));

			expect(response.status).toBe(200);
			expect(requests.filter(({ path }) => path === '/api/v1/guest_users')).toHaveLength(1);
			expect(storedProfile?.payment_provider_id).toBeTruthy();
		});

		it('rejects changing an Easy Pay item to a manual delivery mode without disabling Easy Pay', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const manualBody = withDelivery(actors, actors.catalog.delivery.values.shipping.id, true);
			manualBody.shipping = { ...manualBody.shipping, shipping_price: 1_250 };

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				properties: manualBody.properties,
				shipping: manualBody.shipping,
			});

			expect(response.status).toBe(400);
			await expectNoPaymentProviderRequests();
		});

		it('returns 404 when a concurrent delete wins before the final owner-scoped UPDATE', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client, db } = getTestDatabase();
			const blocker = await client.connect();
			let transactionOpen = false;

			try {
				await blocker.query('BEGIN');
				transactionOpen = true;
				await blocker.query('SELECT id FROM items WHERE id = $1 FOR UPDATE', [item.id]);
				const editResponsePromise = authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
					commons: { title: 'Losing Concurrent Edit' },
				});

				await waitForBlockedItemUpdate();
				await blocker.query('UPDATE items SET deleted_at = NOW(), published = FALSE WHERE id = $1', [item.id]);
				await blocker.query('COMMIT');
				transactionOpen = false;
				const response = await editResponsePromise;
				const [stored] = await db.select().from(items).where(eq(items.id, item.id));

				expect(response.status).toBe(404);
				expect(stored?.title).toBe(item.title);
				expect(stored?.deleted_at).toBeInstanceOf(Date);
			} finally {
				if (transactionOpen) await blocker.query('ROLLBACK');
				blocker.release();
			}
		});

		it('rolls back common fields when replacement property mappings are invalid', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const originalTitle = item.title;
			const { db } = getTestDatabase();
			const before = await db
				.select({ property_value_id: items_properties_values.property_value_id })
				.from(items_properties_values)
				.where(eq(items_properties_values.item_id, item.id));

			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				commons: { title: 'Should Roll Back Completely' },
				properties: [
					{
						id: actors.catalog.unpublishedMapping.property.id,
						slug: actors.catalog.unpublishedMapping.property.slug,
						value: actors.catalog.unpublishedMapping.propertyValue.id,
					},
				],
			});
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));
			const after = await db
				.select({ property_value_id: items_properties_values.property_value_id })
				.from(items_properties_values)
				.where(eq(items_properties_values.item_id, item.id));

			expect(response.status).toBe(400);
			expect(stored?.title).toBe(originalTitle);
			expect(after).toEqual(before);
		});
	});

	describe('POST /item/auth/publish_state', () => {
		it.each([false, true])('lets the owner set published=%s and returns the matching ID', async (published) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db.update(items).set({ published: !published }).where(eq(items.id, item.id));

			const response = await authJson('/item/auth/publish_state', 'POST', actors.seller.jar, {
				id: item.id,
				published,
			});
			const responseBody = await responseJson(response);
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));

			expect(response.status).toBe(200);
			expect(responseBody.id).toBe(item.id);
			expect(stored?.published).toBe(published);
		});

		it('returns 404 when another user toggles the item', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const response = await authJson('/item/auth/publish_state', 'POST', actors.buyer.jar, {
				id: item.id,
				published: false,
			});
			expect(response.status).toBe(404);
		});

		it.each(['subcategory', 'category'] as const)(
			'allows unpublishing but refuses publishing when the item %s is hidden',
			async (hiddenNode) => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				const { db } = getTestDatabase();
				if (hiddenNode === 'subcategory') {
					await db
						.update(subcategories)
						.set({ published: false })
						.where(eq(subcategories.id, actors.catalog.childSubcategory.id));
				} else {
					await db
						.update(categories)
						.set({ published: false })
						.where(eq(categories.id, actors.catalog.publishedCategory.id));
				}

				const unpublishResponse = await authJson('/item/auth/publish_state', 'POST', actors.seller.jar, {
					id: item.id,
					published: false,
				});
				const republishResponse = await authJson('/item/auth/publish_state', 'POST', actors.seller.jar, {
					id: item.id,
					published: true,
				});
				const [stored] = await db.select().from(items).where(eq(items.id, item.id));

				expect(unpublishResponse.status).toBe(200);
				expect(republishResponse.status).toBe(404);
				expect(stored?.published).toBe(false);
			},
		);
	});

	describe('POST /item/auth/user_delete_item', () => {
		it('soft-deletes and unpublishes an owned item', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const response = await authJson('/item/auth/user_delete_item', 'POST', actors.seller.jar, { id: item.id });
			const { db } = getTestDatabase();
			const [stored] = await db.select().from(items).where(eq(items.id, item.id));

			expect(response.status).toBe(200);
			expect(stored?.published).toBe(false);
			expect(stored?.deleted_at).toBeInstanceOf(Date);
		});

		it('returns 404 for another user and for a repeated delete', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const otherResponse = await authJson('/item/auth/user_delete_item', 'POST', actors.buyer.jar, { id: item.id });
			const first = await authJson('/item/auth/user_delete_item', 'POST', actors.seller.jar, { id: item.id });
			const repeated = await authJson('/item/auth/user_delete_item', 'POST', actors.seller.jar, { id: item.id });

			expect(otherResponse.status).toBe(404);
			expect(first.status).toBe(200);
			expect(repeated.status).toBe(404);
		});
	});

	describe('POST /item/auth/buy_now', () => {
		it('rejects buying your own item before contacting providers', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const response = await authJson('/item/auth/buy_now', 'POST', actors.seller.jar, { item_id: item.id });
			expect(response.status).toBe(400);
		});

		it.each([
			['unpublished', { published: false }],
			['unavailable', { status: itemStatus.SOLD }],
		] as const)('rejects an %s item', async (_label, update) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db.update(items).set(update).where(eq(items.id, item.id));

			const response = await authJson('/item/auth/buy_now', 'POST', actors.buyer.jar, { item_id: item.id });
			expect(response.status).toBe(400);
		});

		it('rejects a duplicate active order by the same buyer', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			await createOrderFixture(actors, item);

			const response = await authJson('/item/auth/buy_now', 'POST', actors.buyer.jar, { item_id: item.id });
			const { db } = getTestDatabase();
			const storedOrders = await db.select().from(orders).where(eq(orders.item_id, item.id));

			expect(response.status).toBe(400);
			expect(storedOrders).toHaveLength(1);
		});
	});

	describe('GET /items/:username', () => {
		it.each(['subcategory', 'category'] as const)(
			'hides a manually published item everywhere public when its %s is hidden',
			async (hiddenNode) => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors, { commons: { title: 'Hidden Taxonomy Public Item' } });
				await Promise.all([createImageFixture(item.id, 'medium'), createImageFixture(item.id, 'thumbnail')]);
				const { db } = getTestDatabase();
				await db.insert(profiles_items_favorites).values({
					profile_id: actors.buyer.profile.id,
					item_id: item.id,
				});
				if (hiddenNode === 'subcategory') {
					await db
						.update(subcategories)
						.set({ published: false })
						.where(eq(subcategories.id, actors.catalog.childSubcategory.id));
				} else {
					await db
						.update(categories)
						.set({ published: false })
						.where(eq(categories.id, actors.catalog.publishedCategory.id));
				}

				const [detailResponse, listingResponse, favoritesResponse] = await Promise.all([
					app.request(`/item/${item.id}`),
					app.request(`/items/${actors.seller.user.username}`),
					authJson('/items/auth/user/favorites', 'GET', actors.buyer.jar),
				]);

				expect(detailResponse.status).toBe(404);
				expect(listingResponse.status).toBe(200);
				expect(await listingResponse.json()).toEqual([]);
				expect(favoritesResponse.status).toBe(200);
				expect(await favoritesResponse.json()).toEqual([]);
			},
		);

		it('returns only public available non-deleted items and groups property joins without duplicates', async () => {
			const actors = await createCommerceActors();
			const visible = await createItemFixture(actors, { commons: { title: 'Visible Public Listing' } });
			const unpublished = await createItemFixture(actors, { commons: { title: 'Unpublished Public Listing' } });
			const unavailable = await createItemFixture(actors, { commons: { title: 'Unavailable Public Listing' } });
			const deleted = await createItemFixture(actors, { commons: { title: 'Deleted Public Listing' } });
			await Promise.all([
				createImageFixture(visible.id, 'medium'),
				createImageFixture(unpublished.id, 'medium'),
				createImageFixture(unavailable.id, 'medium'),
				createImageFixture(deleted.id, 'medium'),
			]);
			const { db } = getTestDatabase();
			await Promise.all([
				db.update(items).set({ published: false }).where(eq(items.id, unpublished.id)),
				db.update(items).set({ status: itemStatus.SOLD }).where(eq(items.id, unavailable.id)),
				db.update(items).set({ deleted_at: new Date() }).where(eq(items.id, deleted.id)),
			]);

			const response = await app.request(`/items/${actors.seller.user.username}`);
			const body = (await response.json()) as Array<JsonObject>;

			expect(response.status).toBe(200);
			expect(body).toHaveLength(1);
			expect(body[0]).toMatchObject({
				id: visible.id,
				title: visible.title,
				subcategory: actors.catalog.childSubcategory.slug,
			});
			expect(body[0]?.properties).toMatchObject({
				[actors.catalog.properties.text.slug]: ['cotton'],
				[actors.catalog.properties.numeric.slug]: ['0'],
				[actors.catalog.properties.boolean.slug]: ['false'],
				[actors.catalog.delivery.property.slug]: ['shipping_easy_pay'],
			});
		});

		it('returns 404 for an unknown username', async () => {
			const response = await app.request('/items/definitely-absent-user');
			expect(response.status).toBe(404);
		});
	});

	describe('POST /items/auth/user/selling_items', () => {
		it('filters the authenticated profile by publication state rather than numeric user ID', async () => {
			const actors = await createCommerceActors();
			const published = await createItemFixture(actors, { commons: { title: 'Published Seller Card' } });
			const unpublished = await createItemFixture(actors, { commons: { title: 'Unpublished Seller Card' } });
			const buyerItem = await createItemFixture(actors, { commons: { title: 'Buyer Seller Card' } });
			const { db } = getTestDatabase();
			await db.update(items).set({ published: false }).where(eq(items.id, unpublished.id));
			await db
				.update(items)
				.set({ profile_id: actors.buyer.profile.id, address_id: actors.buyer.address.id })
				.where(eq(items.id, buyerItem.id));
			await Promise.all([
				createImageFixture(published.id, 'thumbnail'),
				createImageFixture(unpublished.id, 'thumbnail'),
				createImageFixture(buyerItem.id, 'thumbnail'),
			]);

			const publishedResponse = await authJson('/items/auth/user/selling_items', 'POST', actors.seller.jar, {
				published: true,
			});
			const unpublishedResponse = await authJson('/items/auth/user/selling_items', 'POST', actors.seller.jar, {
				published: false,
			});
			const publishedBody = (await publishedResponse.json()) as Array<JsonObject>;
			const unpublishedBody = (await unpublishedResponse.json()) as Array<JsonObject>;

			expect(publishedResponse.status).toBe(200);
			expect(unpublishedResponse.status).toBe(200);
			expect(publishedBody.map(({ id }) => id)).toEqual([published.id]);
			expect(unpublishedBody.map(({ id }) => id)).toEqual([unpublished.id]);
			expect(actors.seller.user.id).not.toBe(actors.seller.profile.id);
		});
	});

	describe('GET /items/auth/user/favorites', () => {
		it('returns an empty array when the authenticated profile has no favorites', async () => {
			const actors = await createCommerceActors();
			const response = await authJson('/items/auth/user/favorites', 'GET', actors.buyer.jar);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual([]);
		});

		it('returns cards only for favorited available published items', async () => {
			const actors = await createCommerceActors();
			const visible = await createItemFixture(actors, { commons: { title: 'Favorite Visible Card' } });
			const unpublished = await createItemFixture(actors, { commons: { title: 'Favorite Hidden Card' } });
			const unavailable = await createItemFixture(actors, { commons: { title: 'Favorite Sold Card' } });
			const { db } = getTestDatabase();
			await db.update(items).set({ published: false }).where(eq(items.id, unpublished.id));
			await db.update(items).set({ status: itemStatus.SOLD }).where(eq(items.id, unavailable.id));
			await Promise.all([
				createImageFixture(visible.id, 'thumbnail'),
				createImageFixture(unpublished.id, 'thumbnail'),
				createImageFixture(unavailable.id, 'thumbnail'),
			]);
			await db.insert(profiles_items_favorites).values(
				[visible, unpublished, unavailable].map(({ id }) => ({
					profile_id: actors.buyer.profile.id,
					item_id: id,
				})),
			);

			const response = await authJson('/items/auth/user/favorites', 'GET', actors.buyer.jar);
			const body = (await response.json()) as Array<JsonObject>;

			expect(response.status).toBe(200);
			expect(body).toHaveLength(1);
			expect(body[0]).toMatchObject({
				id: visible.id,
				title: visible.title,
				published: true,
			});
		});
	});
});

describe('updateItemSchema', () => {
	it('requires at least one mutable item field', () => {
		expect(updateItemSchema.safeParse({}).success).toBe(false);
		expect(updateItemSchema.safeParse({ commons: { title: 'Updated Schema Title' } }).success).toBe(true);
	});
});
