import { createHash } from 'node:crypto';

import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { and, asc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import {
	ORDER_PROPOSAL_PHASES,
	ORDER_PHASES,
	PAYMENT_INVITATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import {
	chat_messages,
	chat_rooms,
	entityTrustapTransactions,
	items_images,
	items_properties_values,
	orders,
	orders_proposals,
	payment_invitation_outbox,
	profiles_items_favorites,
	property_values,
	shipping_quotes,
} from '../../src/database/schemas/schema';
import { environment, SHIPPING_UNITS } from '../../src/utils/constants';
import { createCommerceActors, validItemBody } from '../fixtures/commerce';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { waitForEmail } from '../helpers/mailpit';
import { createTestObjectStorageClient } from '../helpers/object-storage';
import { assertShipmentDateWithinWindow, type ProviderOperationWindow } from '../helpers/provider-contract';
import { getProviderRequests } from '../helpers/providers';
import { PROVIDER_TEST_CREDENTIALS, type CapturedRequest } from '../infrastructure/provider-stubs';

type ShippingQuoteResponse = {
	amount: string;
	currency: string;
	shipment_label_id: string;
	shipping_quote_id: string;
};

type ChatMessageResponse = {
	id: number;
	message: string;
	message_type: string;
	order_proposal_id: number | null;
};

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

function projectPropertyMappings<Row extends { item_id: number; property_id: number; property_value_id: number }>(
	rows: Row[],
) {
	return rows
		.map(({ item_id, property_id, property_value_id }) => ({ item_id, property_id, property_value_id }))
		.sort((left, right) => left.property_id - right.property_id);
}

function projectImageRows<Row extends { id: number; created_at: Date; updated_at: Date; size: string }>(rows: Row[]) {
	return rows.map((row) => businessRow(row)).sort((left, right) => left.size.localeCompare(right.size));
}

function expectUuid(value: string | null | undefined): asserts value is string {
	expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
}

describe('exact commerce contract mutation proof', () => {
	const shipmentOperationWindow = {
		operation: 'shipping quote preview',
		startedAt: Date.parse('2026-08-31T11:59:59.999Z'),
		endedAt: Date.parse('2026-08-31T12:00:00.001Z'),
	};
	const sellerProviderAddress = {
		name: 'Seller Fixture',
		street1: 'Corso Venditore 11A',
		street_no: '11A',
		city: 'Milano',
		state: 'MI',
		zip: '20121',
		country: 'IT',
		phone: '+390212345611',
		email: 'seller@example.test',
		is_residential: true,
		validate: false,
	};
	const buyerProviderAddress = {
		name: 'Buyer Fixture',
		street1: 'Rue Acheteur 22B',
		street_no: '22B',
		city: 'Paris',
		state: 'IDF',
		zip: '75001',
		country: 'FR',
		phone: '+33142345622',
		email: 'buyer@example.test',
		is_residential: true,
		validate: false,
	};
	const shippoRequest: CapturedRequest = {
		method: 'POST',
		path: '/shipments',
		headers: {
			authorization: `ShippoToken ${PROVIDER_TEST_CREDENTIALS.shippoApiKey}`,
			'content-type': 'application/json',
			'shippo-api-version': '2018-02-08',
		},
		body: {
			shipment_date: '2026-08-31T12:00:00.000Z',
			address_from: sellerProviderAddress,
			address_to: buyerProviderAddress,
		},
	};
	const trustapRequest: CapturedRequest = {
		method: 'POST',
		path: '/api/v1/me/transactions/create_with_guest_user',
		headers: {
			authorization: `Basic ${Buffer.from(`${PROVIDER_TEST_CREDENTIALS.trustapApiKey}:`).toString('base64')}`,
			'content-type': 'application/json',
			'trustap-user': 'seller-provider-id',
		},
		body: { description: 'Transaction for exact item - (Proposal #7, ref exact-attempt)' },
	};
	const databaseGraph = {
		propertyMappings: [{ item_id: 9, property_id: 10, property_value_id: 11 }],
		images: [
			{
				id: 12,
				item_id: 9,
				url: 'https://bucket.test/exact.png',
				order_position: 0,
				size: 'original',
				created_at: new Date('2026-08-31T12:00:00.000Z'),
				updated_at: new Date('2026-08-31T12:00:00.000Z'),
			},
		],
		provider: {
			id: 13,
			transactionType: 'online_payment',
			entityTitle: 'Exact item',
			created_at: new Date('2026-08-31T12:00:00.000Z'),
			updated_at: new Date('2026-08-31T12:00:00.000Z'),
		},
	};
	const expectedDatabaseProjection = {
		propertyMappings: [{ item_id: 9, property_id: 10, property_value_id: 11 }],
		images: [{ item_id: 9, url: 'https://bucket.test/exact.png', order_position: 0, size: 'original' }],
		provider: { transactionType: 'online_payment', entityTitle: 'Exact item' },
	};
	const projectDatabaseGraph = (graph: typeof databaseGraph) => ({
		propertyMappings: projectPropertyMappings(graph.propertyMappings),
		images: projectImageRows(graph.images),
		provider: businessRow(graph.provider),
	});

	it('rejects a changed Shippo address option after normalization', () => {
		const mutated = structuredClone(shippoRequest);
		(mutated.body as { address_from: { validate: boolean } }).address_from.validate = true;
		expect(() =>
			expect(normalizeProviderRequests([mutated], [shipmentOperationWindow])).toEqual(
				normalizeProviderRequests([shippoRequest], [shipmentOperationWindow]),
			),
		).toThrow();
	});

	it('rejects swapping the complete destination address with seller provider fields', () => {
		const mutated = structuredClone(shippoRequest);
		(mutated.body as { address_to: typeof sellerProviderAddress }).address_to = structuredClone(sellerProviderAddress);
		expect(() =>
			expect(normalizeProviderRequests([mutated], [shipmentOperationWindow])).toEqual(
				normalizeProviderRequests([shippoRequest], [shipmentOperationWindow]),
			),
		).toThrow();
	});

	it.each(['street1', 'street_no', 'city', 'state', 'zip', 'country', 'phone'] as const)(
		'rejects mixing seller %s into the destination address',
		(field) => {
			const mutated = structuredClone(shippoRequest);
			const body = mutated.body as {
				address_from: typeof sellerProviderAddress;
				address_to: typeof buyerProviderAddress;
			};
			body.address_to[field] = body.address_from[field];
			expect(() =>
				expect(normalizeProviderRequests([mutated], [shipmentOperationWindow])).toEqual(
					normalizeProviderRequests([shippoRequest], [shipmentOperationWindow]),
				),
			).toThrow();
		},
	);

	it('accepts only an ISO shipment date generated inside its API operation window', () => {
		const operationWindow = {
			operation: 'shipping quote preview',
			startedAt: Date.parse('2026-08-31T12:00:00.000Z'),
			endedAt: Date.parse('2026-08-31T12:00:00.010Z'),
		};

		expect(() => assertShipmentDateWithinWindow('2026-08-31T12:00:00.005Z', operationWindow)).not.toThrow();
		expect(() => assertShipmentDateWithinWindow('2026-08-31T11:59:59.999Z', operationWindow)).toThrow();
		expect(() => assertShipmentDateWithinWindow('2026-08-31T12:00:00.011Z', operationWindow)).toThrow();
	});

	it('rejects a changed Trustap transaction description after normalization', () => {
		const mutated = structuredClone(trustapRequest);
		(mutated.body as { description: string }).description = 'Different transaction description';
		expect(() =>
			expect(normalizeProviderRequests([mutated])).toEqual(normalizeProviderRequests([trustapRequest])),
		).toThrow();
	});

	it.each([
		[
			'property-value mapping',
			(graph: typeof databaseGraph) => {
				graph.propertyMappings[0]!.property_value_id += 1;
			},
		],
		[
			'image order',
			(graph: typeof databaseGraph) => {
				graph.images[0]!.order_position += 1;
			},
		],
		[
			'provider transaction type',
			(graph: typeof databaseGraph) => {
				graph.provider.transactionType = 'cash';
			},
		],
		[
			'provider entity title',
			(graph: typeof databaseGraph) => {
				graph.provider.entityTitle = 'Different item';
			},
		],
	] as const)('rejects a changed %s in the exact database projection', (_name, mutate) => {
		const mutated = structuredClone(databaseGraph);
		mutate(mutated);
		expect(() => expect(projectDatabaseGraph(mutated)).toEqual(expectedDatabaseProjection)).toThrow();
	});
});

describe('listing, favorite, chat, and proposal workflow', () => {
	it('proves the complete two-party C2C proposal purchase through public API mutations', async () => {
		const actors = await createCommerceActors();
		const expectedTransactionId = trustapTransactionFixture.id + 1;
		const actorUserIds = [actors.seller.user.id, actors.buyer.user.id, actors.outsider.user.id];
		const actorProfileIds = [actors.seller.profile.id, actors.buyer.profile.id, actors.outsider.profile.id];
		expect(actorUserIds.every((id) => !actorProfileIds.includes(id))).toBe(true);
		expect(new Set([actors.seller.jar.header(), actors.buyer.jar.header(), actors.outsider.jar.header()]).size).toBe(3);
		const sellerProviderFingerprintFields = {
			address_id: actors.seller.address.id,
			city_id: actors.seller.address.city_id,
			province_id: actors.seller.address.province_id,
			street_address: actors.seller.address.street_address,
			civic_number: actors.seller.address.civic_number,
			city_name: actors.catalog.actorLocations.seller.city.name,
			province_name: actors.catalog.actorLocations.seller.province.name,
			province_code: actors.catalog.actorLocations.seller.province.state_code,
			country_code: actors.seller.address.country_code,
			postal_code: actors.seller.address.postal_code,
			phone: actors.seller.address.phone,
		};
		const buyerProviderFingerprintFields = {
			address_id: actors.buyer.address.id,
			city_id: actors.buyer.address.city_id,
			province_id: actors.buyer.address.province_id,
			street_address: actors.buyer.address.street_address,
			civic_number: actors.buyer.address.civic_number,
			city_name: actors.catalog.actorLocations.buyer.city.name,
			province_name: actors.catalog.actorLocations.buyer.province.name,
			province_code: actors.catalog.actorLocations.buyer.province.state_code,
			country_code: actors.buyer.address.country_code,
			postal_code: actors.buyer.address.postal_code,
			phone: actors.buyer.address.phone,
		};
		expect(Object.keys(sellerProviderFingerprintFields)).toEqual(Object.keys(buyerProviderFingerprintFields));
		for (const field of Object.keys(sellerProviderFingerprintFields) as Array<
			keyof typeof sellerProviderFingerprintFields
		>) {
			expect(sellerProviderFingerprintFields[field], `${field} must identify the commerce actor`).not.toBe(
				buyerProviderFingerprintFields[field],
			);
		}

		const itemBody = validItemBody(actors, { commons: { title: 'M08 API Workflow Listing' } });
		const createItemResponse = await authenticatedRequest('/item/auth/new', 'POST', actors.seller.jar, itemBody);
		expect(createItemResponse.status).toBe(201);
		const createdItem = (await createItemResponse.json()) as { item_id: number; message: string };
		expect(createdItem.message).toBe('Item created successfully');
		const itemId = Number(createdItem.item_id);
		expect(itemId).toBeGreaterThan(0);

		const sourceImage = await sharp({
			create: {
				width: 32,
				height: 32,
				channels: 4,
				background: { r: 16, g: 185, b: 129, alpha: 1 },
			},
		})
			.png()
			.toBuffer();
		const uploadBody = new FormData();
		uploadBody.set('item_id', String(itemId));
		uploadBody.append('images', new File([sourceImage], 'workflow.png', { type: 'image/png' }));
		const uploadResponse = await app.request('/uploads/auth/images-item', {
			method: 'POST',
			headers: { cookie: actors.seller.jar.header() },
			body: uploadBody,
		});
		expect(uploadResponse.status).toBe(201);
		const uploadResult = (await uploadResponse.json()) as {
			message: string;
			item_id: string;
			files: Array<{
				originalKey: string;
				smallKey: string;
				mediumKey: string;
				thumbKey: string;
				orderPosition: number;
			}>;
		};
		expect(uploadResult.message).toBe(`Images for item ${itemId} uploaded successfully!`);
		expect(uploadResult.item_id).toBe(String(itemId));
		expect(uploadResult.files).toHaveLength(1);
		const uploadedFile = uploadResult.files[0]!;
		expect(Object.keys(uploadedFile).sort()).toEqual([
			'mediumKey',
			'orderPosition',
			'originalKey',
			'smallKey',
			'thumbKey',
		]);
		expect(uploadedFile.orderPosition).toBe(0);

		const bucket = environment.AWS_BUCKET_NAME;
		const endpoint = environment.AWS_ENDPOINT;
		if (!bucket || !endpoint) throw new Error('Missing worker-local object storage configuration');
		const storage = createTestObjectStorageClient(bucket, endpoint);
		try {
			const objects = await storage.send(
				new ListObjectsV2Command({ Bucket: bucket, Prefix: `images/items/${itemId}/` }),
			);
			const keys = (objects.Contents ?? []).flatMap(({ Key }) => (Key ? [Key] : [])).sort();
			expect(keys).toEqual(
				[uploadedFile.originalKey, uploadedFile.mediumKey, uploadedFile.smallKey, uploadedFile.thumbKey].sort(),
			);
			for (const key of keys) {
				const metadata = await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
				expect(metadata.ContentType).toBe('image/png');
			}
		} finally {
			storage.destroy();
		}

		const anonymousDetailResponse = await app.request(`/item/${itemId}`);
		expect(anonymousDetailResponse.status).toBe(200);
		const anonymousDetail = (await anonymousDetailResponse.json()) as {
			id: number;
			title: string;
			images: string[];
			order: { id: number | null };
			orderProposal: { id: number | null };
		};
		expect({
			id: anonymousDetail.id,
			title: anonymousDetail.title,
			order: anonymousDetail.order,
			orderProposal: anonymousDetail.orderProposal,
		}).toEqual({
			id: itemId,
			title: itemBody.commons.title,
			order: { id: null },
			orderProposal: { id: null },
		});
		expect(anonymousDetail.images).toHaveLength(1);
		expect(anonymousDetail.images[0]).toContain('_original.png');

		const favoriteAddResponse = await authenticatedRequest('/favorites/auth/handle', 'POST', actors.buyer.jar, {
			action: 'add',
			item_id: itemId,
		});
		expect(favoriteAddResponse.status).toBe(200);
		expect(await favoriteAddResponse.json()).toBe(true);
		const favoriteCheckResponse = await authenticatedRequest(
			`/favorites/auth/check/${itemId}`,
			'GET',
			actors.buyer.jar,
		);
		expect(favoriteCheckResponse.status).toBe(200);
		expect(await favoriteCheckResponse.json()).toBe(true);
		const favoritesResponse = await authenticatedRequest('/items/auth/user/favorites', 'GET', actors.buyer.jar);
		expect(favoritesResponse.status).toBe(200);
		const favorites = (await favoritesResponse.json()) as Array<{ id: number; title: string; published: boolean }>;
		expect(favorites.map(({ id, title, published }) => ({ id, title, published }))).toEqual([
			{ id: itemId, title: itemBody.commons.title, published: true },
		]);

		const roomResponse = await authenticatedRequest('/chat/auth/rooms', 'POST', actors.buyer.jar, { item_id: itemId });
		expect(roomResponse.status).toBe(200);
		const roomId = ((await roomResponse.json()) as { id: number }).id;
		const buyerText = "Ciao, l'articolo è ancora disponibile?";
		const sellerText = 'Sì, è disponibile e posso spedirlo domani.';
		const buyerMessageResponse = await authenticatedRequest(
			`/chat/auth/rooms/${roomId}/messages`,
			'POST',
			actors.buyer.jar,
			{ message: buyerText },
		);
		expect(buyerMessageResponse.status).toBe(200);
		const buyerMessage = (await buyerMessageResponse.json()) as ChatMessageResponse & {
			chat_room_id: number;
			sender_id: number;
		};
		expect({
			chat_room_id: buyerMessage.chat_room_id,
			sender_id: buyerMessage.sender_id,
			message: buyerMessage.message,
			message_type: buyerMessage.message_type,
			order_proposal_id: buyerMessage.order_proposal_id,
		}).toEqual({
			chat_room_id: roomId,
			sender_id: actors.buyer.profile.id,
			message: buyerText,
			message_type: 'text',
			order_proposal_id: null,
		});
		const sellerMessageEmail = await waitForEmail(actors.seller.user.email, 'Tantovale - New message received');
		expect(sellerMessageEmail.HTML).toContain(buyerText);

		const sellerMessageResponse = await authenticatedRequest(
			`/chat/auth/rooms/${roomId}/messages`,
			'POST',
			actors.seller.jar,
			{ message: sellerText },
		);
		expect(sellerMessageResponse.status).toBe(200);
		const sellerMessage = (await sellerMessageResponse.json()) as ChatMessageResponse & {
			chat_room_id: number;
			sender_id: number;
		};
		expect({
			chat_room_id: sellerMessage.chat_room_id,
			sender_id: sellerMessage.sender_id,
			message: sellerMessage.message,
			message_type: sellerMessage.message_type,
			order_proposal_id: sellerMessage.order_proposal_id,
		}).toEqual({
			chat_room_id: roomId,
			sender_id: actors.seller.profile.id,
			message: sellerText,
			message_type: 'text',
			order_proposal_id: null,
		});
		const buyerMessageEmail = await waitForEmail(actors.buyer.user.email, 'Tantovale - New message received');
		expect(buyerMessageEmail.HTML).toContain(sellerText);

		const shippingQuoteStartedAt = Date.now();
		const quoteResponse = await authenticatedRequest(
			'/shipment_provider/auth/calculate_shipment_cost',
			'POST',
			actors.buyer.jar,
			{ item_id: itemId },
		);
		const shippingQuoteEndedAt = Date.now();
		const shippingQuoteOperation = {
			operation: 'proposal shipping quote preview',
			startedAt: shippingQuoteStartedAt,
			endedAt: shippingQuoteEndedAt,
		};
		expect(quoteResponse.status).toBe(200);
		const quote = ((await quoteResponse.json()) as { rates: ShippingQuoteResponse[] }).rates[0];
		expect(quote).toEqual({
			amount: '7.50',
			currency: 'EUR',
			shipment_label_id: 'shipment-test',
			shipping_quote_id: quote!.shipping_quote_id,
		});
		expect(quote?.shipping_quote_id).toMatch(/^[0-9a-f-]{36}$/);

		const proposalMessage = 'Posso offrirti cento euro per questo articolo?';
		const proposalResponse = await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
			item_id: itemId,
			proposal_price: 10_000,
			shipping_label_id: quote!.shipment_label_id,
			shipping_quote_id: quote!.shipping_quote_id,
			message: proposalMessage,
		});
		expect(proposalResponse.status).toBe(200);
		const proposalBody = (await proposalResponse.json()) as {
			chatRoomId: number;
			proposal: {
				id: number;
				status: string;
				proposal_price: number;
				shipping_label_id: string;
				shipping_quote_id: string;
				shipping_price: number;
				platform_charge: number;
				payment_provider_charge: number;
			};
		};
		expect(proposalBody.chatRoomId).toBe(roomId);
		expect({
			status: proposalBody.proposal.status,
			proposal_price: proposalBody.proposal.proposal_price,
			shipping_label_id: proposalBody.proposal.shipping_label_id,
			shipping_quote_id: proposalBody.proposal.shipping_quote_id,
			shipping_price: proposalBody.proposal.shipping_price,
			platform_charge: proposalBody.proposal.platform_charge,
			payment_provider_charge: proposalBody.proposal.payment_provider_charge,
		}).toEqual({
			status: ORDER_PROPOSAL_PHASES.pending,
			proposal_price: 10_000,
			shipping_label_id: 'shipment-test',
			shipping_quote_id: quote!.shipping_quote_id,
			shipping_price: 750,
			platform_charge: 90,
			payment_provider_charge: 505,
		});
		const proposalEmail = await waitForEmail(
			actors.seller.user.email,
			`Tantovale - Proposal received from ${actors.buyer.user.username}`,
		);
		expect(proposalEmail.HTML).toContain(proposalMessage);

		const sellerMessagesResponse = await authenticatedRequest(
			`/chat/auth/rooms/${roomId}/messages`,
			'GET',
			actors.seller.jar,
		);
		expect(sellerMessagesResponse.status).toBe(200);
		const sellerMessages = (await sellerMessagesResponse.json()) as ChatMessageResponse[];
		expect(sellerMessages.map(({ message, message_type }) => ({ message, message_type }))).toEqual([
			{ message: buyerText, message_type: 'text' },
			{ message: sellerText, message_type: 'text' },
			{ message: proposalMessage, message_type: 'proposal' },
		]);
		expect(sellerMessages[2]?.order_proposal_id).toBe(proposalBody.proposal.id);

		const acceptResponse = await authenticatedRequest('/orders_proposals/auth', 'PUT', actors.seller.jar, {
			id: proposalBody.proposal.id,
			item_id: itemId,
			status: 'accepted',
		});
		expect(acceptResponse.status).toBe(200);
		const accepted = (await acceptResponse.json()) as {
			proposal: { id: number; status: string };
			order: { id: number };
			transaction: { id: number; status: string };
		};
		expect({
			proposal: { id: accepted.proposal.id, status: accepted.proposal.status },
			order: accepted.order,
			transaction: accepted.transaction,
		}).toEqual({
			proposal: { id: proposalBody.proposal.id, status: ORDER_PROPOSAL_PHASES.accepted },
			order: { id: accepted.order.id },
			transaction: { id: expectedTransactionId, status: 'created' },
		});
		const invitationEmail = await waitForEmail(actors.buyer.user.email, 'Tantovale - Proposal accepted');
		expect(invitationEmail.HTML).toContain(`/auth/profile/orders?highlight=${accepted.order.id}`);
		expect(invitationEmail.HTML).toContain(`/online/transactions/${accepted.transaction.id}/guest_pay`);

		const buyerOrderResponse = await authenticatedRequest(`/orders/auth/${accepted.order.id}`, 'GET', actors.buyer.jar);
		const sellerOrderResponse = await authenticatedRequest(
			`/orders/auth/${accepted.order.id}`,
			'GET',
			actors.seller.jar,
		);
		const outsiderOrderResponse = await authenticatedRequest(
			`/orders/auth/${accepted.order.id}`,
			'GET',
			actors.outsider.jar,
		);
		expect(buyerOrderResponse.status).toBe(200);
		expect(sellerOrderResponse.status).toBe(200);
		expect(outsiderOrderResponse.status).toBe(404);
		const buyerOrder = (await buyerOrderResponse.json()) as Record<string, unknown>;
		const sellerOrder = (await sellerOrderResponse.json()) as Record<string, unknown>;
		expect({
			id: buyerOrder.id,
			item_id: buyerOrder.item_id,
			buyer_id: buyerOrder.buyer_id,
			seller_id: buyerOrder.seller_id,
			status: buyerOrder.status,
			payment_transaction_id: buyerOrder.payment_transaction_id,
			item_price: buyerOrder.item_price,
		}).toEqual({
			id: accepted.order.id,
			item_id: itemId,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_transaction_id: expectedTransactionId,
			item_price: 10_000,
		});
		expect(String(buyerOrder.payment_url)).toContain(`/online/transactions/${expectedTransactionId}/guest_pay`);
		expect({ id: sellerOrder.id, status: sellerOrder.status }).toEqual({
			id: accepted.order.id,
			status: ORDER_PHASES.PAYMENT_PENDING,
		});
		expect(sellerOrder).not.toHaveProperty('payment_url');

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
			throw new Error('Expected the complete item relation graph');
		}
		const {
			address: itemAddress,
			author: itemAuthor,
			itemsImages: rqbImages,
			propertyValues: rqbPropertyValues,
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

		const expectedPropertyValues = [
			{ ...actors.catalog.propertyValues.text, property: actors.catalog.properties.text },
			{ ...actors.catalog.propertyValues.numeric, property: actors.catalog.properties.numeric },
			{ ...actors.catalog.propertyValues.boolean, property: actors.catalog.properties.boolean },
			{ ...actors.catalog.delivery.values.easyPay, property: actors.catalog.delivery.property },
		].sort((left, right) => left.id - right.id);
		expect([...rqbPropertyValues].sort((left, right) => left.id - right.id)).toEqual(expectedPropertyValues);
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
		expect(projectPropertyMappings(propertyMappings)).toEqual(
			[
				[actors.catalog.properties.text.id, actors.catalog.propertyValues.text.id],
				[actors.catalog.properties.numeric.id, actors.catalog.propertyValues.numeric.id],
				[actors.catalog.properties.boolean.id, actors.catalog.propertyValues.boolean.id],
				[actors.catalog.delivery.property.id, actors.catalog.delivery.values.easyPay.id],
			]
				.map(([property_id, property_value_id]) => ({ item_id: itemId, property_id, property_value_id }))
				.sort((left, right) => Number(left.property_id) - Number(right.property_id)),
		);

		const originalImage = rqbImages.find(({ size }) => size === 'original');
		if (!originalImage) throw new Error('Missing original workflow image');
		const imageSourceMatch = uploadedFile.originalKey.match(
			new RegExp(`^images/items/${itemId}/full/([0-9a-f-]{36}-0)_original\\.png$`),
		);
		expect(imageSourceMatch).not.toBeNull();
		const imageSourceId = imageSourceMatch?.[1];
		if (!imageSourceId) throw new Error('Invalid workflow image object key');
		const stableImages = projectImageRows(rqbImages);
		expect(new Set(rqbImages.map(({ id }) => id)).size).toBe(4);
		expect(stableImages).toEqual(
			[
				{ size: 'original', directory: 'full' },
				{ size: 'medium', directory: 'full' },
				{ size: 'small', directory: 'full' },
				{ size: 'thumbnail', directory: 'thumbs' },
			]
				.map(({ size, directory }) => ({
					item_id: itemId,
					url: `https://${bucket}.s3.amazonaws.com/images/items/${itemId}/${directory}/${imageSourceId}_${size}.png`,
					order_position: uploadedFile.orderPosition,
					size,
				}))
				.sort((left, right) => left.size.localeCompare(right.size)),
		);

		const favoriteRows = await db
			.select()
			.from(profiles_items_favorites)
			.where(
				and(
					eq(profiles_items_favorites.profile_id, actors.buyer.profile.id),
					eq(profiles_items_favorites.item_id, itemId),
				),
			);
		expect(favoriteRows).toHaveLength(1);
		const favorite = favoriteRows[0]!;
		expect(businessRow(favorite)).toEqual({ profile_id: actors.buyer.profile.id, item_id: itemId });
		const [room] = await db.select().from(chat_rooms).where(eq(chat_rooms.id, roomId));
		if (!room) throw new Error('Missing workflow chat room');
		expect(stableRow(room)).toEqual({ id: roomId, item_id: itemId, buyer_id: actors.buyer.profile.id });
		const storedMessages = await db
			.select()
			.from(chat_messages)
			.where(eq(chat_messages.chat_room_id, roomId))
			.orderBy(asc(chat_messages.id));
		expect(
			storedMessages.map(({ id, created_at, read_at, ...business }, index) => {
				expect(id).toBeGreaterThan(0);
				expect(created_at).toBeInstanceOf(Date);
				if (index === 0 || index === 2) expect(read_at).toBeInstanceOf(Date);
				else expect(read_at).toBeNull();
				return business;
			}),
		).toEqual([
			{
				chat_room_id: roomId,
				sender_id: actors.buyer.profile.id,
				message: buyerText,
				message_type: 'text',
				order_proposal_id: null,
				metadata: null,
			},
			{
				chat_room_id: roomId,
				sender_id: actors.seller.profile.id,
				message: sellerText,
				message_type: 'text',
				order_proposal_id: null,
				metadata: null,
			},
			{
				chat_room_id: roomId,
				sender_id: actors.buyer.profile.id,
				message: proposalMessage,
				message_type: 'proposal',
				order_proposal_id: proposalBody.proposal.id,
				metadata: null,
			},
			{
				chat_room_id: roomId,
				sender_id: actors.seller.profile.id,
				message: `Proposal #${proposalBody.proposal.id}, has been accepted by the seller.`,
				message_type: 'system',
				order_proposal_id: null,
				metadata: { order_id: accepted.order.id, type: 'proposal_accepted' },
			},
		]);

		const [storedProposal] = await db
			.select()
			.from(orders_proposals)
			.where(eq(orders_proposals.id, proposalBody.proposal.id));
		if (!storedProposal) throw new Error('Missing stored proposal');
		expect(stableRow(storedProposal)).toEqual({
			id: proposalBody.proposal.id,
			item_id: itemId,
			profile_id: actors.buyer.profile.id,
			original_price: itemBody.commons.price,
			proposal_price: 10_000,
			payment_provider_charge: 505,
			platform_charge: 90,
			shipping_label_id: 'shipment-test',
			shipping_quote_id: quote!.shipping_quote_id,
			shipping_price: 750,
			status: ORDER_PROPOSAL_PHASES.accepted,
		});
		const [storedQuote] = await db
			.select()
			.from(shipping_quotes)
			.where(eq(shipping_quotes.id, quote!.shipping_quote_id));
		if (!storedQuote) throw new Error('Missing stored shipping quote');
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
		const {
			created_at: quoteCreatedAt,
			expires_at: quoteExpiresAt,
			consumed_at: quoteConsumedAt,
			...quoteBusiness
		} = storedQuote;
		expect(quoteCreatedAt).toBeInstanceOf(Date);
		expect(quoteExpiresAt).toBeInstanceOf(Date);
		expect(quoteConsumedAt).toBeInstanceOf(Date);
		expect(Number.isFinite(quoteExpiresAt.getTime())).toBe(true);
		expect(quoteBusiness).toEqual({
			id: quote!.shipping_quote_id,
			checkout_attempt_id: null,
			item_id: itemId,
			buyer_profile_id: actors.buyer.profile.id,
			seller_profile_id: actors.seller.profile.id,
			buyer_address_id: actors.buyer.address.id,
			seller_address_id: actors.seller.address.id,
			shippo_shipment_id: 'shipment-test',
			shippo_rate_id: 'rate-test',
			amount: 750,
			currency: 'EUR',
			snapshot_fingerprint: expectedFingerprint,
		});
		const orderGraph = await db.query.orders.findFirst({
			where: { id: accepted.order.id },
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
			!orderGraph.paymentInvitation ||
			!orderGraph.seller
		) {
			throw new Error('Expected the complete order relation graph');
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
			id: accepted.order.id,
			item_id: itemId,
			payment_provider_charge: 505,
			platform_charge: 90,
			shipping_label_id: 'shipment-test',
			shipping_price: 750,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			payment_transaction_id: String(expectedTransactionId),
			legacy_payment_transaction_id: null,
			payment_attempt_id: orderGraph.payment_attempt_id,
			payment_creation_state: 'created',
			payment_cancellation_state: 'none',
			item_price: 10_000,
			order_proposal_id: proposalBody.proposal.id,
			shipping_quote_id: quote!.shipping_quote_id,
			status: ORDER_PHASES.PAYMENT_PENDING,
		});
		const normalizeOrderResponse = (responseOrder: Record<string, unknown>) => {
			const { created_at, updated_at, ...business } = responseOrder;
			expect(Number.isFinite(Date.parse(String(created_at)))).toBe(true);
			expect(Number.isFinite(Date.parse(String(updated_at)))).toBe(true);
			return business;
		};
		const publicOrderFields = {
			id: accepted.order.id,
			item_id: itemId,
			payment_provider_charge: 505,
			platform_charge: 90,
			shipping_label_id: 'shipment-test',
			shipping_price: 750,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			item_price: 10_000,
			order_proposal_id: proposalBody.proposal.id,
			shipping_quote_id: quote!.shipping_quote_id,
			status: ORDER_PHASES.PAYMENT_PENDING,
		};
		expect(normalizeOrderResponse(buyerOrder)).toEqual({
			...publicOrderFields,
			payment_transaction_id: expectedTransactionId,
			payment_url: buyerOrder.payment_url,
		});
		expect(String(buyerOrder.payment_url)).toContain(`/online/transactions/${expectedTransactionId}/guest_pay`);
		expect(normalizeOrderResponse(sellerOrder)).toEqual(publicOrderFields);
		expect(stableRow(addressBuyerAddress)).toEqual(stableRow(actors.buyer.address));
		expect(stableRow(addressSellerAddress)).toEqual(stableRow(actors.seller.address));
		expect(stableRow(buyer)).toEqual(stableRow(actors.buyer.profile));
		expect(stableRow(seller)).toEqual(stableRow(actors.seller.profile));
		expect(stableRow(orderedItem)).toEqual(stableRow(itemRow));

		const {
			id: invitationId,
			created_at: invitationCreatedAt,
			updated_at: invitationUpdatedAt,
			last_attempt_at: invitationLastAttemptAt,
			sent_at: invitationSentAt,
			...invitationBusiness
		} = paymentInvitation;
		expect(invitationId).toBeGreaterThan(0);
		expect(invitationCreatedAt).toBeInstanceOf(Date);
		expect(invitationUpdatedAt).toBeInstanceOf(Date);
		expect(invitationLastAttemptAt).toBeInstanceOf(Date);
		expect(invitationSentAt).toBeInstanceOf(Date);
		expect(invitationBusiness).toEqual({
			order_id: accepted.order.id,
			transaction_id: String(expectedTransactionId),
			recipient_email: actors.buyer.user.email,
			merchant_username: actors.seller.user.username,
			item_name: itemBody.commons.title,
			state: PAYMENT_INVITATION_STATES.SENT,
			attempt_count: 1,
			lease_token: null,
			lease_expires_at: null,
		});
		const orderRows = await db.select().from(orders).where(eq(orders.item_id, itemId));
		expect(orderRows).toHaveLength(1);
		expect(orderRows[0]).toEqual(orderRow);
		const invitationRows = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, accepted.order.id));
		expect(invitationRows).toEqual([paymentInvitation]);
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
			price: 10_090,
			charge: 505,
			chargeSeller: 0,
			currency: 'eur',
			entityTitle: itemBody.commons.title,
			claimedBySeller: false,
			claimedByBuyer: false,
			complaintPeriodDeadline: null,
			quarantined: false,
		});
		expect(await db.select().from(items_images).where(eq(items_images.item_id, itemId))).toEqual(rqbImages);

		const shippoRequests = await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'));
		const shippoHeaders = {
			authorization: `ShippoToken ${PROVIDER_TEST_CREDENTIALS.shippoApiKey}`,
			'content-type': 'application/json',
			'shippo-api-version': '2018-02-08',
		};
		const shippoGetHeaders = {
			authorization: shippoHeaders.authorization,
			'shippo-api-version': shippoHeaders['shippo-api-version'],
		};
		const expectedShipmentBody = {
			metadata: `tvq1:${quote!.shipping_quote_id}`,
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
		};
		expect(normalizeProviderRequests(shippoRequests, [shippingQuoteOperation])).toEqual([
			{ method: 'POST', path: '/shipments', headers: shippoHeaders, body: expectedShipmentBody },
			{ method: 'GET', path: '/shipments/shipment-test', headers: shippoGetHeaders, body: undefined },
			{ method: 'GET', path: '/shipments/shipment-test', headers: shippoGetHeaders, body: undefined },
		]);
		const trustapRequests = await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'));
		const expectedChargePath = '/api/v1/charge?price=10090&currency=eur&postage_fee=750&use_hr_post=false';
		const trustapAuthorization = `Basic ${Buffer.from(`${PROVIDER_TEST_CREDENTIALS.trustapApiKey}:`).toString('base64')}`;
		const trustapHeaders = { authorization: trustapAuthorization, 'content-type': 'application/json' };
		expect(normalizeProviderRequests(trustapRequests)).toEqual([
			{ method: 'GET', path: expectedChargePath, headers: trustapHeaders, body: undefined },
			{ method: 'GET', path: expectedChargePath, headers: trustapHeaders, body: undefined },
			{
				method: 'POST',
				path: '/api/v1/me/transactions/create_with_guest_user',
				headers: {
					...trustapHeaders,
					'trustap-user': actors.seller.profile.payment_provider_id,
				},
				body: {
					seller_id: actors.seller.profile.payment_provider_id,
					buyer_id: actors.buyer.profile.payment_provider_id,
					creator_role: 'seller',
					currency: 'eur',
					description: `Transaction for ${itemBody.commons.title} - (Proposal #${proposalBody.proposal.id}, ref ${orderGraph?.payment_attempt_id})`,
					price: 10_090,
					postage_fee: 750,
					charge: 505,
					charge_calculator_version: 1,
				},
			},
		]);
	});
});
