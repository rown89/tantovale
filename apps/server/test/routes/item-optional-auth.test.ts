import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import {
	addresses,
	categories,
	cities,
	countries,
	items,
	orders,
	orders_proposals,
	refreshTokens,
	shipping_quotes,
	states,
	subcategories,
} from '../../src/database/schemas/schema';
import { createUserFixture, uniqueValue } from '../fixtures/factories';
import { loginAs } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { extractTokenFromLink, waitForEmail } from '../helpers/mailpit';
import { jsonRequest } from '../helpers/request';

type ItemMetadata = {
	order: { id: number | null; status?: string };
	orderProposal: { id: number | null; status?: string };
};

function cookieValue(cookieHeader: string, name: string): string {
	const value = cookieHeader
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${name}=`))
		?.slice(name.length + 1);
	if (!value) {
		throw new Error(`Missing ${name} fixture cookie`);
	}
	return value;
}

async function createItemWithPendingBuyerMetadata() {
	const seller = await createUserFixture({ emailVerified: true });
	const buyer = await createUserFixture({ emailVerified: true });
	const { db } = getTestDatabase();
	const suffix = uniqueValue('optional-item');

	return db.transaction(async (tx) => {
		await tx.insert(countries).values({
			id: 1,
			name: 'Italy',
			iso3: 'ITA',
			iso2: 'IT',
			phonecode: '39',
		});
		await tx.insert(states).values({
			id: 1,
			name: 'Lombardia',
			country_id: 1,
			country_code: 'IT',
			state_code: 'LOM',
		});
		await tx.insert(cities).values({
			id: 1,
			name: 'Milano',
			state_id: 1,
			state_code: 'MI',
			country_id: 1,
			country_code: 'IT',
			latitude: '45.46420000',
			longitude: '9.19000000',
		});
		const [address] = await tx
			.insert(addresses)
			.values({
				profile_id: seller.profile.id,
				street_address: 'Via Test',
				civic_number: '1',
				city_id: 1,
				province_id: 1,
				postal_code: 20100,
				phone: '+3900000000',
			})
			.returning();
		const [buyerAddress] = await tx
			.insert(addresses)
			.values({
				profile_id: buyer.profile.id,
				street_address: 'Via Buyer',
				civic_number: '2',
				city_id: 1,
				province_id: 1,
				postal_code: 20100,
				phone: '+3900000001',
			})
			.returning();
		const [category] = await tx
			.insert(categories)
			.values({ name: `Category ${suffix}`, slug: `category-${suffix}` })
			.returning();
		const [subcategory] = await tx
			.insert(subcategories)
			.values({
				name: `Subcategory ${suffix}`,
				slug: `subcategory-${suffix}`,
				category_id: category!.id,
			})
			.returning();
		const [item] = await tx
			.insert(items)
			.values({
				profile_id: seller.profile.id,
				subcategory_id: subcategory!.id,
				address_id: address!.id,
				title: 'Optional authentication item',
				description: 'Public item with private buyer metadata',
				price: 10_000,
				published: true,
			})
			.returning();
		const quoteId = randomUUID();
		await tx.insert(shipping_quotes).values({
			id: quoteId,
			item_id: item!.id,
			buyer_profile_id: buyer.profile.id,
			seller_profile_id: seller.profile.id,
			buyer_address_id: buyerAddress!.id,
			seller_address_id: address!.id,
			shippo_shipment_id: `shipment-${suffix}`,
			shippo_rate_id: `rate-${suffix}`,
			amount: 500,
			currency: 'EUR',
			snapshot_fingerprint: `fingerprint-${suffix}`,
			expires_at: new Date(Date.now() + 96 * 60 * 60 * 1_000),
		});
		const [proposal] = await tx
			.insert(orders_proposals)
			.values({
				item_id: item!.id,
				profile_id: buyer.profile.id,
				original_price: item!.price,
				proposal_price: 9_000,
				payment_provider_charge: 100,
				platform_charge: 200,
				shipping_label_id: `proposal-${suffix}`,
				shipping_quote_id: quoteId,
				shipping_price: 500,
			})
			.returning();
		const [order] = await tx
			.insert(orders)
			.values({
				item_id: item!.id,
				buyer_id: buyer.profile.id,
				seller_id: seller.profile.id,
				payment_provider_charge: 100,
				platform_charge: 200,
				shipping_label_id: `order-${suffix}`,
				shipping_price: 500,
				item_price: item!.price,
			})
			.returning();

		return { buyer, item: item!, order: order!, proposal: proposal! };
	});
}

async function resetPassword(email: string): Promise<Response> {
	const forgot = await app.request('/password/forgot-password', jsonRequest('POST', { email }));
	expect(forgot.status).toBe(200);
	const emailMessage = await waitForEmail(email, 'Password Reset');
	const token = extractTokenFromLink(`${emailMessage.HTML} ${emailMessage.Text}`, 'token');
	return app.request('/password/auth/reset', jsonRequest('POST', { token, newPassword: 'OptionalSessionReset456!' }));
}

async function itemMetadata(itemId: number, cookie?: string): Promise<{ response: Response; body: ItemMetadata }> {
	const response = await app.request(`/item/${itemId}`, cookie ? { headers: { cookie } } : undefined);
	return { response, body: (await response.json()) as ItemMetadata };
}

describe('public item optional authentication', () => {
	it('hides buyer metadata from the same cookies after password reset revokes their session', async () => {
		const fixture = await createItemWithPendingBuyerMetadata();
		const jar = await loginAs(fixture.buyer);
		const originalCookies = jar.header();

		const authenticated = await itemMetadata(fixture.item.id, originalCookies);
		expect(authenticated.response.status).toBe(200);
		expect(authenticated.body.order.id).toBe(fixture.order.id);
		expect(authenticated.body.orderProposal.id).toBe(fixture.proposal.id);

		expect((await resetPassword(fixture.buyer.user.email)).status).toBe(200);
		const revoked = await itemMetadata(fixture.item.id, originalCookies);
		const { db } = getTestDatabase();

		expect(revoked.response.status).toBe(200);
		expect(revoked.body.order.id).toBeNull();
		expect(revoked.body.orderProposal.id).toBeNull();
		expect(
			await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.buyer.user.username)),
		).toEqual([]);
	});

	it('requires both cookies from a live session before exposing buyer metadata', async () => {
		const fixture = await createItemWithPendingBuyerMetadata();
		const jar = await loginAs(fixture.buyer);
		const accessOnly = `access_token=${cookieValue(jar.header(), 'access_token')}`;

		const result = await itemMetadata(fixture.item.id, accessOnly);

		expect(result.response.status).toBe(200);
		expect(result.body.order.id).toBeNull();
		expect(result.body.orderProposal.id).toBeNull();
	});

	it('treats malformed optional cookies as a guest without breaking public retrieval', async () => {
		const fixture = await createItemWithPendingBuyerMetadata();
		const result = await itemMetadata(fixture.item.id, 'access_token=malformed; refresh_token=also-malformed');

		expect(result.response.status).toBe(200);
		expect(result.body.order.id).toBeNull();
		expect(result.body.orderProposal.id).toBeNull();
	});
});
