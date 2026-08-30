import { describe, expect, it } from 'vitest';

import { createItemSchema, minDescriptionLength } from '../../src/extended_schemas/item';
import { getTestDatabase } from '../helpers/database';
import {
	createCommerceActors,
	createImageFixture,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
	validItemBody,
} from './commerce';

describe('commerce fixtures', () => {
	it('persists a two-party item graph through every required Drizzle relation', async () => {
		const actors = await createCommerceActors();
		const body = validItemBody(actors);
		const item = await createItemFixture(actors);
		const image = await createImageFixture(item.id, 'original', 2);
		const { db } = getTestDatabase();
		const storedItem = await db.query.items.findFirst({
			where: { id: item.id },
			with: {
				address: {
					with: {
						cityCityId: true,
						cityProvinceId: true,
						profile: true,
					},
				},
				author: true,
				itemsImages: true,
				propertyValues: { with: { property: true } },
				subcategory: true,
			},
		});
		const storedUsers = await db.query.users.findMany();
		const paymentProviderIds = [
			actors.seller.profile.payment_provider_id,
			actors.buyer.profile.payment_provider_id,
			actors.outsider.profile.payment_provider_id,
		];

		expect([actors.seller, actors.buyer, actors.outsider].every(({ user, profile }) => user.id !== profile.id)).toBe(
			true,
		);
		expect(storedUsers).toHaveLength(3);
		expect(paymentProviderIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
		expect(new Set(paymentProviderIds)).toHaveProperty('size', 3);
		expect(actors.seller.jar.header()).toContain('access_token=');
		expect(actors.buyer.jar.header()).toContain('refresh_token=');
		expect(actors.outsider.jar.header()).toContain('access_token=');
		expect(createItemSchema.parse(body)).toEqual(body);
		expect(body.commons.description.length).toBeGreaterThanOrEqual(minDescriptionLength);
		expect(Number.isInteger(body.commons.price)).toBe(true);
		expect(body.commons.address_id).toBe(actors.seller.address.id);
		expect(Object.values(body.shipping ?? {}).every((value) => typeof value === 'number' && value > 0)).toBe(true);
		expect(storedItem).toMatchObject({
			id: item.id,
			profile_id: actors.seller.profile.id,
			address_id: actors.seller.address.id,
			subcategory_id: actors.catalog.childSubcategory.id,
			published: true,
			status: 'available',
			easy_pay: true,
			author: { id: actors.seller.profile.id, user_id: actors.seller.user.id },
			subcategory: { id: actors.catalog.childSubcategory.id },
			address: {
				id: actors.seller.address.id,
				profile_id: actors.seller.profile.id,
				cityCityId: { id: actors.catalog.city.id },
				cityProvinceId: { id: actors.catalog.city.id },
				profile: { id: actors.seller.profile.id },
			},
			itemsImages: [
				expect.objectContaining({
					id: image.id,
					item_id: item.id,
					order_position: 2,
					size: 'original',
				}),
			],
		});
		expect(storedItem?.propertyValues.map(({ id }) => id).sort((a, b) => a - b)).toEqual(
			Object.values(actors.catalog.propertyValues)
				.map(({ id }) => id)
				.sort((a, b) => a - b),
		);
		expect(storedItem?.propertyValues.map(({ property }) => property?.id).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
			Object.values(actors.catalog.properties)
				.map(({ id }) => id)
				.sort((a, b) => a - b),
		);
	});

	it('builds typed item, proposal, and order variants with correct participant foreign keys', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors, {
			commons: { price: 25_000, title: 'Overridden Commerce Item' },
			shipping: { shipping_price: 1_450 },
		});
		const proposal = await createProposalFixture(actors, item, { proposal_price: 22_000 });
		const order = await createOrderFixture(actors, item, { shipping_price: 1_450 });
		const { db } = getTestDatabase();
		const storedProposal = await db.query.orders_proposals.findFirst({
			where: { id: proposal.id },
			with: { item: true, profile: true },
		});
		const storedOrder = await db.query.orders.findFirst({
			where: { id: order.id },
			with: {
				addressBuyerAddress: true,
				addressSellerAddress: true,
				buyer: true,
				item: true,
				seller: true,
			},
		});

		expect(item).toMatchObject({
			price: 25_000,
			title: 'Overridden Commerce Item',
			custom_shipping_price: 1_450,
		});
		expect(storedProposal).toMatchObject({
			id: proposal.id,
			item_id: item.id,
			profile_id: actors.buyer.profile.id,
			proposal_price: 22_000,
			item: { id: item.id },
			profile: { id: actors.buyer.profile.id },
		});
		expect(storedOrder).toMatchObject({
			id: order.id,
			item_id: item.id,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			addressBuyerAddress: { id: actors.buyer.address.id, profile_id: actors.buyer.profile.id },
			addressSellerAddress: { id: actors.seller.address.id, profile_id: actors.seller.profile.id },
			buyer: { id: actors.buyer.profile.id },
			seller: { id: actors.seller.profile.id },
			item: { id: item.id },
		});
	});
});
