import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import {
	addresses,
	items,
	items_properties_values,
	orders,
	profiles,
	profiles_items_favorites,
	properties,
	property_values,
	subcategory_properties,
} from '../../src/database/schemas/schema';
import { itemStatus, ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import { updateItemSchema } from '../../src/extended_schemas/item';
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
import { uniqueValue } from '../fixtures/factories';
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

async function createDeliveryOptions(actors: CommerceActorGraph) {
	const { db } = getTestDatabase();
	const suffix = uniqueValue('delivery');
	const [deliveryProperty] = await db
		.insert(properties)
		.values({ name: `Delivery ${suffix}`, slug: 'delivery_method', type: 'select' })
		.returning();

	if (!deliveryProperty) throw new Error('Delivery property fixture insert failed');

	await db.insert(subcategory_properties).values({
		property_id: deliveryProperty.id,
		subcategory_id: actors.catalog.childSubcategory.id,
		on_item_create_required: true,
		position: 99,
	});

	const [pickup, shipping, easyPay] = await db
		.insert(property_values)
		.values([
			{ property_id: deliveryProperty.id, name: 'Pickup', value: 'pickup' },
			{ property_id: deliveryProperty.id, name: 'Shipping', value: 'shipping' },
			{ property_id: deliveryProperty.id, name: 'Easy Pay', value: 'shipping_easy_pay' },
		])
		.returning();

	if (!pickup || !shipping || !easyPay) throw new Error('Delivery value fixture insert failed');

	return { property: deliveryProperty, pickup, shipping, easyPay };
}

function withDelivery(
	actors: CommerceActorGraph,
	delivery: Awaited<ReturnType<typeof createDeliveryOptions>>,
	valueId: number,
) {
	const body = validItemBody(actors, { commons: { easy_pay: false } });
	return {
		...body,
		properties: [
			...(body.properties ?? []),
			{ id: delivery.property.id, slug: delivery.property.slug, value: valueId },
		],
	};
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
			expect(body.properties).toHaveLength(3);
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
			expect(storedProperties.map(({ property_value_id }) => property_value_id).sort((a, b) => a - b)).toEqual(
				(body.properties ?? [])
					.flatMap(({ value }) => (Array.isArray(value) ? value : [value]))
					.map(Number)
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

		it('rejects pickup when a shipping price is supplied without persisting an item', async () => {
			const actors = await createCommerceActors();
			const delivery = await createDeliveryOptions(actors);
			const body = withDelivery(actors, delivery, delivery.pickup.id);
			const { db } = getTestDatabase();

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			const stored = await db.select().from(items);

			expect(response.status).toBe(400);
			expect(stored).toEqual([]);
		});

		it.each(['shipping_price', 'item_weight', 'item_length', 'item_width', 'item_height'] as const)(
			'rejects shipping when %s is missing or zero',
			async (field) => {
				const actors = await createCommerceActors();
				const delivery = await createDeliveryOptions(actors);
				const body = withDelivery(actors, delivery, delivery.shipping.id);
				body.shipping = { ...body.shipping, [field]: 0 };

				const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
				expect(response.status).toBe(400);
			},
		);

		it.each([
			['unknown property', () => [{ id: 2147483647, slug: 'unknown', value: 2147483647 }]],
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
		});

		it('rejects an address owned by another profile', async () => {
			const actors = await createCommerceActors();
			const body = validItemBody(actors, { commons: { address_id: actors.buyer.address.id } });

			const response = await authJson('/item/auth/new', 'POST', actors.seller.jar, body);
			expect(response.status).toBe(400);
		});
	});

	describe('PUT /item/auth/edit/:id', () => {
		it('lets the owner update mutable fields, address, and replace property joins transactionally', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const replacementAddress = await createAddressFixture(actors.seller.profile.id, {
				label: 'Warehouse',
				status: 'inactive',
			});
			const { db } = getTestDatabase();
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
					value: actors.catalog.propertyValues.numeric.id,
				},
				{
					id: actors.catalog.properties.boolean.id,
					slug: actors.catalog.properties.boolean.slug,
					value: actors.catalog.propertyValues.boolean.id,
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
				propertiesBody.map(({ value }) => value).sort((a, b) => a - b),
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

		it('merges a partial shipping patch with existing dimensions before validating it', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const delivery = await createDeliveryOptions(actors);
			const { db } = getTestDatabase();
			await db.insert(items_properties_values).values({
				item_id: item.id,
				property_value_id: delivery.shipping.id,
			});

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

		it('rejects a replacement address owned by another profile', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const response = await authJson(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
				commons: { address_id: actors.buyer.address.id },
			});
			expect(response.status).toBe(400);
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
			expect(Object.keys(body[0]?.properties as JsonObject)).toHaveLength(3);
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
