import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import {
	entityTrustapTransactions,
	orders,
	payment_invitation_outbox,
	shipping_quotes,
} from '../../src/database/schemas/schema';
import { calculatePlatformFee } from '../../src/utils/platform-costs';
import { createCommerceActors, validItemBody } from '../fixtures/commerce';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { waitForEmail } from '../helpers/mailpit';
import { getProviderRequests } from '../helpers/providers';

function providerUrl(name: 'PAYMENT_PROVIDER_API_URL' | 'SHIPPING_PROVIDER_API_URL'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}`);
	const parsed = new URL(value);
	if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port) {
		throw new Error(`Unsafe ${name}`);
	}
	return value;
}

async function mailCount(recipient: string, subject: string): Promise<number> {
	/* eslint-disable-next-line turbo/no-undeclared-env-vars -- Vitest supplies a loopback Mailpit URL. */
	const origin = process.env.MAILPIT_API_URL;
	if (!origin) throw new Error('Missing MAILPIT_API_URL');
	const url = new URL('/api/v1/search', origin);
	if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
		throw new Error('Unsafe MAILPIT_API_URL');
	}
	url.searchParams.set('query', `to:${recipient}`);
	const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
	if (!response.ok) throw new Error(`Mailpit search failed with ${response.status}`);
	const body = (await response.json()) as {
		messages: Array<{ Subject: string; To: Array<{ Address: string }> }>;
	};
	return body.messages.filter(
		(message) => message.Subject === subject && message.To.some(({ Address }) => Address === recipient),
	).length;
}

describe('independent Buy Now workflow', () => {
	it('creates one payable order and rejects a repeated purchase without partial duplicates', async () => {
		const actors = await createCommerceActors();
		expect(actors.seller.user.id).not.toBe(actors.seller.profile.id);
		expect(actors.buyer.user.id).not.toBe(actors.buyer.profile.id);
		expect(actors.seller.jar.header()).not.toBe(actors.buyer.jar.header());

		const itemBody = validItemBody(actors, { commons: { title: 'M08 Independent Buy Now Listing' } });
		const createItemResponse = await authenticatedRequest('/item/auth/new', 'POST', actors.seller.jar, itemBody);
		expect(createItemResponse.status).toBe(201);
		const itemId = Number(((await createItemResponse.json()) as { item_id: number }).item_id);
		expect(itemId).toBeGreaterThan(0);

		const shippingPrice = 750;
		const platformCharge = Math.round(itemBody.commons.price * calculatePlatformFee(itemBody.commons.price));
		const transactionPrice = itemBody.commons.price + platformCharge;
		const paymentProviderCharge = Math.round(transactionPrice * 0.05);
		const platformResponse = await authenticatedRequest(
			'/platforms_costs/auth/calculate_platform_costs',
			'POST',
			actors.buyer.jar,
			{ price: itemBody.commons.price, shipping_price: shippingPrice },
		);
		expect(platformResponse.status).toBe(200);
		expect(await platformResponse.json()).toMatchObject({
			platform_charge: platformCharge,
			payment_provider_charge: paymentProviderCharge,
		});

		const previewResponse = await authenticatedRequest(
			'/shipment_provider/auth/calculate_shipment_cost',
			'POST',
			actors.buyer.jar,
			{ item_id: itemId },
		);
		expect(previewResponse.status).toBe(200);
		const preview = (
			(await previewResponse.json()) as {
				rates: Array<{
					amount: string;
					currency: string;
					shipment_label_id: string;
					shipping_quote_id: string;
				}>;
			}
		).rates[0];
		expect(preview).toMatchObject({ amount: '7.50', currency: 'EUR', shipment_label_id: 'shipment-test' });
		expect(preview?.shipping_quote_id).toMatch(/^[0-9a-f-]{36}$/);

		const buyNowResponse = await authenticatedRequest('/item/auth/buy_now', 'POST', actors.buyer.jar, {
			item_id: itemId,
		});
		expect(buyNowResponse.status).toBe(200);
		const buyNow = (await buyNowResponse.json()) as {
			success: boolean;
			order: { id: number; status: string };
			payment_url: string;
			message: string;
		};
		const expectedTransactionId = trustapTransactionFixture.id + 1;
		expect(buyNow).toMatchObject({
			success: true,
			order: { id: expect.any(Number), status: ORDER_PHASES.PAYMENT_PENDING },
			message: 'Order created, complete the payment for the next step',
		});
		expect(buyNow.payment_url).toContain(`/online/transactions/${expectedTransactionId}/guest_pay`);

		const mailSubject = `Tantovale - Order created for ${itemBody.commons.title}`;
		const orderEmail = await waitForEmail(actors.buyer.user.email, mailSubject);
		expect(orderEmail.HTML).toContain(itemBody.commons.title);
		expect(orderEmail.HTML).toContain(actors.seller.user.username);
		expect(await mailCount(actors.buyer.user.email, mailSubject)).toBe(1);

		const buyerOrderResponse = await authenticatedRequest(`/orders/auth/${buyNow.order.id}`, 'GET', actors.buyer.jar);
		expect(buyerOrderResponse.status).toBe(200);
		expect(await buyerOrderResponse.json()).toMatchObject({
			id: buyNow.order.id,
			item_id: itemId,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			item_price: itemBody.commons.price,
			platform_charge: platformCharge,
			payment_provider_charge: paymentProviderCharge,
			shipping_price: shippingPrice,
			shipping_label_id: 'shipment-test-2',
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_transaction_id: expectedTransactionId,
			payment_url: buyNow.payment_url,
		});

		const shippoBeforeRepeat = await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'));
		const trustapBeforeRepeat = await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'));
		const repeatResponse = await authenticatedRequest('/item/auth/buy_now', 'POST', actors.buyer.jar, {
			item_id: itemId,
		});
		expect(repeatResponse.status).toBe(400);
		expect(await repeatResponse.json()).toEqual({ error: 'An active order already exists for this item' });
		expect(await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'))).toEqual(shippoBeforeRepeat);
		expect(await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).toEqual(trustapBeforeRepeat);

		const { db } = getTestDatabase();
		const orderGraph = await db.query.orders.findFirst({
			where: { id: buyNow.order.id },
			with: {
				addressBuyerAddress: true,
				addressSellerAddress: true,
				buyer: true,
				item: true,
				paymentInvitation: true,
				seller: true,
			},
		});
		expect(orderGraph).toMatchObject({
			id: buyNow.order.id,
			item_id: itemId,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			item_price: itemBody.commons.price,
			platform_charge: platformCharge,
			payment_provider_charge: paymentProviderCharge,
			shipping_price: shippingPrice,
			shipping_label_id: 'shipment-test-2',
			payment_transaction_id: String(expectedTransactionId),
			payment_creation_state: 'created',
			payment_cancellation_state: 'none',
			status: ORDER_PHASES.PAYMENT_PENDING,
			addressBuyerAddress: { id: actors.buyer.address.id, profile_id: actors.buyer.profile.id },
			addressSellerAddress: { id: actors.seller.address.id, profile_id: actors.seller.profile.id },
			buyer: { id: actors.buyer.profile.id },
			item: { id: itemId },
			seller: { id: actors.seller.profile.id },
			paymentInvitation: null,
		});
		expect(orderGraph?.payment_attempt_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(await db.select().from(orders).where(eq(orders.item_id, itemId))).toHaveLength(1);
		const providerRows = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.entityId, itemId));
		expect(providerRows).toEqual([
			expect.objectContaining({
				transactionId: String(expectedTransactionId),
				buyerId: actors.buyer.profile.payment_provider_id,
				sellerId: actors.seller.profile.payment_provider_id,
				price: transactionPrice,
				charge: paymentProviderCharge,
				currency: 'eur',
				status: 'created',
				quarantined: false,
			}),
		]);
		expect(
			await db.select().from(payment_invitation_outbox).where(eq(payment_invitation_outbox.order_id, buyNow.order.id)),
		).toEqual([]);
		const quoteRows = await db.select().from(shipping_quotes).where(eq(shipping_quotes.item_id, itemId));
		expect(quoteRows).toHaveLength(2);
		expect(quoteRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: preview!.shipping_quote_id,
					shippo_shipment_id: 'shipment-test',
					buyer_profile_id: actors.buyer.profile.id,
					seller_profile_id: actors.seller.profile.id,
					consumed_at: null,
				}),
				expect.objectContaining({
					id: orderGraph?.shipping_quote_id,
					shippo_shipment_id: 'shipment-test-2',
					buyer_profile_id: actors.buyer.profile.id,
					seller_profile_id: actors.seller.profile.id,
					consumed_at: expect.any(Date),
				}),
			]),
		);

		expect(shippoBeforeRepeat.map(({ method, path }) => `${method} ${path}`)).toEqual([
			'POST /shipments',
			'POST /shipments',
		]);
		expect((shippoBeforeRepeat[0]?.body as { metadata?: string }).metadata).toBe(`tvq1:${preview!.shipping_quote_id}`);
		expect((shippoBeforeRepeat[1]?.body as { metadata?: string }).metadata).toBe(
			`tvq1:${orderGraph?.shipping_quote_id}`,
		);
		expect(trustapBeforeRepeat.map(({ method, path }) => `${method} ${path.split('?')[0]}`)).toEqual([
			'GET /api/v1/charge',
			'GET /api/v1/charge',
			'POST /api/v1/me/transactions/create_with_guest_user',
		]);
		const expectedChargePath = `/api/v1/charge?price=${transactionPrice}&currency=eur&postage_fee=${shippingPrice}&use_hr_post=false`;
		expect(trustapBeforeRepeat[0]?.path).toBe(expectedChargePath);
		expect(trustapBeforeRepeat[1]?.path).toBe(expectedChargePath);
		expect(trustapBeforeRepeat[2]).toMatchObject({
			headers: { 'trustap-user': actors.buyer.profile.payment_provider_id },
			body: {
				buyer_id: actors.buyer.profile.payment_provider_id,
				seller_id: actors.seller.profile.payment_provider_id,
				creator_role: 'buyer',
				price: transactionPrice,
				postage_fee: shippingPrice,
				charge: paymentProviderCharge,
				features: ['use_custom_postage_fee'],
			},
		});
		expect((trustapBeforeRepeat[2]?.body as { description?: string }).description).toContain(
			orderGraph?.payment_attempt_id,
		);
		expect(await mailCount(actors.buyer.user.email, mailSubject)).toBe(1);
	});
});
