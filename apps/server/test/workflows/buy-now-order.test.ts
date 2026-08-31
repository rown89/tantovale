import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import {
	entityTrustapTransactions,
	items_images,
	items_properties_values,
	orders,
	orders_proposals,
	payment_invitation_outbox,
	property_values,
	shipping_quotes,
} from '../../src/database/schemas/schema';
import { environment, SHIPPING_UNITS } from '../../src/utils/constants';
import { calculatePlatformFee } from '../../src/utils/platform-costs';
import { createCommerceActors, validItemBody } from '../fixtures/commerce';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { waitForEmail } from '../helpers/mailpit';
import { assertShipmentDateWithinWindow, type ProviderOperationWindow } from '../helpers/provider-contract';
import { getProviderRequests } from '../helpers/providers';
import { PROVIDER_TEST_CREDENTIALS, type CapturedRequest } from '../infrastructure/provider-stubs';

function providerUrl(name: 'PAYMENT_PROVIDER_API_URL' | 'SHIPPING_PROVIDER_API_URL'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}`);
	const parsed = new URL(value);
	if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port) {
		throw new Error(`Unsafe ${name}`);
	}
	return value;
}

function normalizeProviderRequests(requests: CapturedRequest[], shipmentOperations: ProviderOperationWindow[] = []) {
	let shipmentOperationIndex = 0;
	const normalizedRequests = requests.map(({ method, path, headers, body }) => {
		let normalizedBody = body;
		if (typeof body === 'object' && body !== null && 'shipment_date' in body) {
			const shipmentDate = body.shipment_date;
			const operationWindow = shipmentOperations[shipmentOperationIndex++];
			if (!operationWindow) throw new Error('Missing API operation window for Shippo request');
			assertShipmentDateWithinWindow(shipmentDate, operationWindow);
			normalizedBody = { ...body, shipment_date: '<iso-date>' };
		}

		const businessHeaders = Object.fromEntries(
			['authorization', 'content-type', 'shippo-api-version', 'trustap-user'].flatMap((name) =>
				headers[name] === undefined ? [] : [[name, headers[name]]],
			),
		);

		return { method, path, headers: businessHeaders, body: normalizedBody };
	});
	if (shipmentOperationIndex !== shipmentOperations.length) {
		throw new Error('API operation window does not correspond to a Shippo request');
	}
	return normalizedRequests;
}

function stableRow<Row extends { created_at: Date; updated_at: Date }>(
	row: Row,
): Omit<Row, 'created_at' | 'updated_at'> {
	const { created_at, updated_at, ...stable } = row;
	expect(created_at).toBeInstanceOf(Date);
	expect(updated_at).toBeInstanceOf(Date);
	return stable;
}

function businessRow<Row extends { id: number; created_at: Date; updated_at: Date }>(
	row: Row,
): Omit<Row, 'id' | 'created_at' | 'updated_at'> {
	const { id, created_at, updated_at, ...business } = row;
	expect(id).toBeGreaterThan(0);
	expect(created_at).toBeInstanceOf(Date);
	expect(updated_at).toBeInstanceOf(Date);
	return business;
}

function expectUuid(value: string | null | undefined): asserts value is string {
	expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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
		const actorUserIds = [actors.seller.user.id, actors.buyer.user.id, actors.outsider.user.id];
		const actorProfileIds = [actors.seller.profile.id, actors.buyer.profile.id, actors.outsider.profile.id];
		expect(actorUserIds.every((id) => !actorProfileIds.includes(id))).toBe(true);
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
		expect(await platformResponse.json()).toEqual({
			platform_charge: platformCharge,
			payment_provider_charge: paymentProviderCharge,
			proposalExpireTime: environment.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS,
		});

		const previewStartedAt = Date.now();
		const previewResponse = await authenticatedRequest(
			'/shipment_provider/auth/calculate_shipment_cost',
			'POST',
			actors.buyer.jar,
			{ item_id: itemId },
		);
		const previewEndedAt = Date.now();
		const previewOperation = {
			operation: 'buy-now shipping quote preview',
			startedAt: previewStartedAt,
			endedAt: previewEndedAt,
		};
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
		expect(preview).toEqual({
			amount: '7.50',
			currency: 'EUR',
			shipment_label_id: 'shipment-test',
			shipping_quote_id: preview!.shipping_quote_id,
		});
		expect(preview?.shipping_quote_id).toMatch(/^[0-9a-f-]{36}$/);

		const buyNowStartedAt = Date.now();
		const buyNowResponse = await authenticatedRequest('/item/auth/buy_now', 'POST', actors.buyer.jar, {
			item_id: itemId,
		});
		const buyNowEndedAt = Date.now();
		const buyNowOperation = {
			operation: 'buy-now checkout',
			startedAt: buyNowStartedAt,
			endedAt: buyNowEndedAt,
		};
		expect(buyNowResponse.status).toBe(200);
		const buyNow = (await buyNowResponse.json()) as {
			success: boolean;
			order: { id: number; status: string };
			payment_url: string;
			message: string;
		};
		const expectedTransactionId = trustapTransactionFixture.id + 1;
		expect(buyNow).toEqual({
			success: true,
			order: { id: buyNow.order.id, status: ORDER_PHASES.PAYMENT_PENDING },
			payment_url: buyNow.payment_url,
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
		const buyerOrder = (await buyerOrderResponse.json()) as Record<string, unknown>;

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
		const itemGraph = await db.query.items.findFirst({
			where: { id: itemId },
			with: {
				address: true,
				author: true,
				itemsImages: true,
				propertyValues: { with: { property: true } },
				subcategory: true,
			},
		});
		if (!itemGraph || !itemGraph.address || !itemGraph.author || !itemGraph.subcategory) {
			throw new Error('Expected the complete Buy Now item relation graph');
		}
		const {
			address: itemAddress,
			author: itemAuthor,
			itemsImages: itemImages,
			propertyValues: itemPropertyValues,
			subcategory: itemSubcategory,
			...itemRow
		} = itemGraph;
		expect(stableRow(itemRow)).toEqual({
			id: itemId,
			profile_id: actors.seller.profile.id,
			subcategory_id: actors.catalog.childSubcategory.id,
			address_id: actors.seller.address.id,
			title: itemBody.commons.title,
			description: itemBody.commons.description,
			status: 'available',
			published: true,
			price: itemBody.commons.price,
			easy_pay: itemBody.commons.easy_pay,
			item_weight: itemBody.shipping!.item_weight,
			item_length: itemBody.shipping!.item_length,
			item_width: itemBody.shipping!.item_width,
			item_height: itemBody.shipping!.item_height,
			custom_shipping_price: itemBody.shipping!.shipping_price,
			deleted_at: null,
		});
		expect(stableRow(itemAddress)).toEqual(stableRow(actors.seller.address));
		expect(stableRow(itemAuthor)).toEqual(stableRow(actors.seller.profile));
		expect(stableRow(itemSubcategory)).toEqual(stableRow(actors.catalog.childSubcategory));
		expect(itemImages).toEqual([]);
		expect([...itemPropertyValues].sort((left, right) => left.id - right.id)).toEqual(
			[
				{ ...actors.catalog.propertyValues.text, property: actors.catalog.properties.text },
				{ ...actors.catalog.propertyValues.numeric, property: actors.catalog.properties.numeric },
				{ ...actors.catalog.propertyValues.boolean, property: actors.catalog.properties.boolean },
				{ ...actors.catalog.delivery.values.easyPay, property: actors.catalog.delivery.property },
			].sort((left, right) => left.id - right.id),
		);
		const propertyMappings = await db
			.select({
				item_id: items_properties_values.item_id,
				property_id: property_values.property_id,
				property_value_id: items_properties_values.property_value_id,
			})
			.from(items_properties_values)
			.innerJoin(property_values, eq(property_values.id, items_properties_values.property_value_id))
			.where(eq(items_properties_values.item_id, itemId))
			.orderBy(property_values.property_id);
		expect(propertyMappings).toEqual(
			[
				[actors.catalog.properties.text.id, actors.catalog.propertyValues.text.id],
				[actors.catalog.properties.numeric.id, actors.catalog.propertyValues.numeric.id],
				[actors.catalog.properties.boolean.id, actors.catalog.propertyValues.boolean.id],
				[actors.catalog.delivery.property.id, actors.catalog.delivery.values.easyPay.id],
			]
				.map(([property_id, property_value_id]) => ({ item_id: itemId, property_id, property_value_id }))
				.sort((left, right) => Number(left.property_id) - Number(right.property_id)),
		);
		expect(await db.select().from(items_images).where(eq(items_images.item_id, itemId))).toEqual([]);
		expect(await db.select().from(orders_proposals).where(eq(orders_proposals.item_id, itemId))).toEqual([]);

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
		if (
			!orderGraph ||
			!orderGraph.addressBuyerAddress ||
			!orderGraph.addressSellerAddress ||
			!orderGraph.buyer ||
			!orderGraph.item ||
			!orderGraph.seller
		) {
			throw new Error('Expected the complete Buy Now order relation graph');
		}
		expectUuid(orderGraph.payment_attempt_id);
		const {
			addressBuyerAddress,
			addressSellerAddress,
			buyer,
			item: orderedItem,
			paymentInvitation,
			seller,
			...orderRow
		} = orderGraph;
		expect(stableRow(orderRow)).toEqual({
			id: buyNow.order.id,
			item_id: itemId,
			payment_provider_charge: paymentProviderCharge,
			platform_charge: platformCharge,
			shipping_label_id: 'shipment-test-2',
			shipping_price: shippingPrice,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			payment_transaction_id: String(expectedTransactionId),
			legacy_payment_transaction_id: null,
			payment_attempt_id: orderGraph.payment_attempt_id,
			payment_creation_state: 'created',
			payment_cancellation_state: 'none',
			item_price: itemBody.commons.price,
			order_proposal_id: null,
			shipping_quote_id: orderGraph.shipping_quote_id,
			status: ORDER_PHASES.PAYMENT_PENDING,
		});
		const { created_at: orderCreatedAt, updated_at: orderUpdatedAt, ...buyerOrderBusiness } = buyerOrder;
		expect(Number.isFinite(Date.parse(String(orderCreatedAt)))).toBe(true);
		expect(Number.isFinite(Date.parse(String(orderUpdatedAt)))).toBe(true);
		expect(buyerOrderBusiness).toEqual({
			id: buyNow.order.id,
			item_id: itemId,
			payment_provider_charge: paymentProviderCharge,
			platform_charge: platformCharge,
			shipping_label_id: 'shipment-test-2',
			shipping_price: shippingPrice,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			item_price: itemBody.commons.price,
			order_proposal_id: null,
			shipping_quote_id: orderGraph.shipping_quote_id,
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_transaction_id: expectedTransactionId,
			payment_url: buyNow.payment_url,
		});
		expect(stableRow(addressBuyerAddress)).toEqual(stableRow(actors.buyer.address));
		expect(stableRow(addressSellerAddress)).toEqual(stableRow(actors.seller.address));
		expect(stableRow(buyer)).toEqual(stableRow(actors.buyer.profile));
		expect(stableRow(seller)).toEqual(stableRow(actors.seller.profile));
		expect(stableRow(orderedItem)).toEqual(stableRow(itemRow));
		expect(paymentInvitation).toBeNull();
		const orderRows = await db.select().from(orders).where(eq(orders.item_id, itemId));
		expect(orderRows).toEqual([orderRow]);
		const providerRows = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.entityId, itemId));
		expect(providerRows).toHaveLength(1);
		const providerRow = providerRows[0]!;
		expect(businessRow(providerRow)).toEqual({
			entityId: itemId,
			sellerId: actors.seller.profile.payment_provider_id,
			buyerId: actors.buyer.profile.payment_provider_id,
			transactionId: String(expectedTransactionId),
			transactionType: 'online_payment',
			status: 'created',
			price: transactionPrice,
			charge: paymentProviderCharge,
			chargeSeller: 0,
			currency: 'eur',
			entityTitle: itemBody.commons.title,
			claimedBySeller: false,
			claimedByBuyer: false,
			complaintPeriodDeadline: null,
			quarantined: false,
		});
		expect(
			await db.select().from(payment_invitation_outbox).where(eq(payment_invitation_outbox.order_id, buyNow.order.id)),
		).toEqual([]);
		const quoteRows = await db.select().from(shipping_quotes).where(eq(shipping_quotes.item_id, itemId));
		expect(quoteRows).toHaveLength(2);
		const expectedFingerprint = createHash('sha256')
			.update(
				JSON.stringify([
					'v1',
					itemId,
					actors.seller.profile.id,
					actors.seller.address.id,
					'available',
					true,
					true,
					actors.catalog.childSubcategory.id,
					actors.catalog.childSubcategory.category_id,
					actors.seller.address.id,
					actors.seller.address.city_id,
					actors.seller.address.province_id,
					actors.seller.address.street_address,
					actors.seller.address.civic_number,
					actors.catalog.actorLocations.seller.city.name,
					actors.catalog.actorLocations.seller.province.name,
					actors.catalog.actorLocations.seller.province.state_code,
					actors.seller.address.country_code,
					actors.seller.address.postal_code,
					actors.seller.address.phone,
					itemBody.shipping!.item_weight,
					itemBody.shipping!.item_length,
					itemBody.shipping!.item_width,
					itemBody.shipping!.item_height,
					actors.buyer.profile.id,
					actors.buyer.address.id,
					actors.buyer.address.city_id,
					actors.buyer.address.province_id,
					actors.buyer.address.street_address,
					actors.buyer.address.civic_number,
					actors.catalog.actorLocations.buyer.city.name,
					actors.catalog.actorLocations.buyer.province.name,
					actors.catalog.actorLocations.buyer.province.state_code,
					actors.buyer.address.country_code,
					actors.buyer.address.postal_code,
					actors.buyer.address.phone,
				]),
			)
			.digest('hex');
		const stableQuotes = quoteRows
			.map(({ created_at, expires_at, consumed_at, ...business }) => {
				expect(created_at).toBeInstanceOf(Date);
				expect(expires_at).toBeInstanceOf(Date);
				expect(Number.isFinite(expires_at.getTime())).toBe(true);
				if (business.id === preview!.shipping_quote_id) expect(consumed_at).toBeNull();
				else expect(consumed_at).toBeInstanceOf(Date);
				return business;
			})
			.sort((left, right) => left.shippo_shipment_id.localeCompare(right.shippo_shipment_id));
		expect(stableQuotes).toEqual([
			{
				id: preview!.shipping_quote_id,
				checkout_attempt_id: null,
				item_id: itemId,
				buyer_profile_id: actors.buyer.profile.id,
				seller_profile_id: actors.seller.profile.id,
				buyer_address_id: actors.buyer.address.id,
				seller_address_id: actors.seller.address.id,
				shippo_shipment_id: 'shipment-test',
				shippo_rate_id: 'rate-test',
				amount: shippingPrice,
				currency: 'EUR',
				snapshot_fingerprint: expectedFingerprint,
			},
			{
				id: orderGraph.shipping_quote_id,
				checkout_attempt_id: orderGraph.payment_attempt_id,
				item_id: itemId,
				buyer_profile_id: actors.buyer.profile.id,
				seller_profile_id: actors.seller.profile.id,
				buyer_address_id: actors.buyer.address.id,
				seller_address_id: actors.seller.address.id,
				shippo_shipment_id: 'shipment-test-2',
				shippo_rate_id: 'rate-test-2',
				amount: shippingPrice,
				currency: 'EUR',
				snapshot_fingerprint: expectedFingerprint,
			},
		]);

		const shippoHeaders = {
			authorization: `ShippoToken ${PROVIDER_TEST_CREDENTIALS.shippoApiKey}`,
			'content-type': 'application/json',
			'shippo-api-version': '2018-02-08',
		};
		const expectedShipmentBody = (metadata: string) => ({
			metadata,
			shipment_date: '<iso-date>',
			address_from: {
				name: `${actors.seller.profile.name} ${actors.seller.profile.surname}`,
				street1: `${actors.seller.address.street_address} ${actors.seller.address.civic_number}`,
				street_no: actors.seller.address.civic_number,
				city: actors.catalog.actorLocations.seller.city.name,
				state: actors.catalog.actorLocations.seller.province.state_code,
				zip: String(actors.seller.address.postal_code),
				country: actors.seller.address.country_code,
				phone: actors.seller.address.phone,
				email: actors.seller.user.email,
				is_residential: true,
				validate: false,
			},
			address_to: {
				name: `${actors.buyer.profile.name} ${actors.buyer.profile.surname}`,
				street1: `${actors.buyer.address.street_address} ${actors.buyer.address.civic_number}`,
				street_no: actors.buyer.address.civic_number,
				city: actors.catalog.actorLocations.buyer.city.name,
				state: actors.catalog.actorLocations.buyer.province.state_code,
				zip: String(actors.buyer.address.postal_code),
				country: actors.buyer.address.country_code,
				phone: actors.buyer.address.phone,
				email: actors.buyer.user.email,
				is_residential: true,
				validate: false,
			},
			async: false,
			parcels: [
				{
					mass_unit: SHIPPING_UNITS.MASS,
					weight: String(itemBody.shipping!.item_weight),
					distance_unit: SHIPPING_UNITS.DISTANCE,
					height: String(itemBody.shipping!.item_height),
					length: String(itemBody.shipping!.item_length),
					width: String(itemBody.shipping!.item_width),
				},
			],
		});
		expect(normalizeProviderRequests(shippoBeforeRepeat, [previewOperation, buyNowOperation])).toEqual([
			{
				method: 'POST',
				path: '/shipments',
				headers: shippoHeaders,
				body: expectedShipmentBody(`tvq1:${preview!.shipping_quote_id}`),
			},
			{
				method: 'POST',
				path: '/shipments',
				headers: shippoHeaders,
				body: expectedShipmentBody(`tvq1:${orderGraph?.shipping_quote_id}`),
			},
		]);
		const expectedChargePath = `/api/v1/charge?price=${transactionPrice}&currency=eur&postage_fee=${shippingPrice}&use_hr_post=false`;
		const trustapAuthorization = `Basic ${Buffer.from(`${PROVIDER_TEST_CREDENTIALS.trustapApiKey}:`).toString('base64')}`;
		const trustapHeaders = { authorization: trustapAuthorization, 'content-type': 'application/json' };
		expect(normalizeProviderRequests(trustapBeforeRepeat)).toEqual([
			{ method: 'GET', path: expectedChargePath, headers: trustapHeaders, body: undefined },
			{ method: 'GET', path: expectedChargePath, headers: trustapHeaders, body: undefined },
			{
				method: 'POST',
				path: '/api/v1/me/transactions/create_with_guest_user',
				headers: {
					...trustapHeaders,
					'trustap-user': actors.buyer.profile.payment_provider_id,
				},
				body: {
					seller_id: actors.seller.profile.payment_provider_id,
					buyer_id: actors.buyer.profile.payment_provider_id,
					creator_role: 'buyer',
					currency: 'eur',
					description: `Transaction for ${itemBody.commons.title} - (Buy Now, ref ${orderGraph?.payment_attempt_id})`,
					price: transactionPrice,
					postage_fee: shippingPrice,
					charge: paymentProviderCharge,
					charge_calculator_version: 1,
					features: ['use_custom_postage_fee'],
				},
			},
		]);
		expect(await mailCount(actors.buyer.user.email, mailSubject)).toBe(1);
	});
});
