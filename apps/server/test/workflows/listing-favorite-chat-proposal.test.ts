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
	shipping_quotes,
} from '../../src/database/schemas/schema';
import { environment, SHIPPING_UNITS } from '../../src/utils/constants';
import { createCommerceActors, validItemBody } from '../fixtures/commerce';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { waitForEmail } from '../helpers/mailpit';
import { createTestObjectStorageClient } from '../helpers/object-storage';
import { getProviderRequests } from '../helpers/providers';

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

describe('listing, favorite, chat, and proposal workflow', () => {
	it('proves the complete two-party C2C proposal purchase through public API mutations', async () => {
		const actors = await createCommerceActors();
		const expectedTransactionId = trustapTransactionFixture.id + 1;
		const actorUserIds = [actors.seller.user.id, actors.buyer.user.id, actors.outsider.user.id];
		const actorProfileIds = [actors.seller.profile.id, actors.buyer.profile.id, actors.outsider.profile.id];
		expect(actorUserIds.every((id) => !actorProfileIds.includes(id))).toBe(true);
		expect(new Set([actors.seller.jar.header(), actors.buyer.jar.header(), actors.outsider.jar.header()]).size).toBe(3);

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
		expect(await uploadResponse.json()).toMatchObject({ item_id: String(itemId) });

		const bucket = environment.AWS_BUCKET_NAME;
		const endpoint = environment.AWS_ENDPOINT;
		if (!bucket || !endpoint) throw new Error('Missing worker-local object storage configuration');
		const storage = createTestObjectStorageClient(bucket, endpoint);
		try {
			const objects = await storage.send(
				new ListObjectsV2Command({ Bucket: bucket, Prefix: `images/items/${itemId}/` }),
			);
			const keys = (objects.Contents ?? []).flatMap(({ Key }) => (Key ? [Key] : [])).sort();
			expect(keys).toHaveLength(4);
			expect(keys.map((key) => key.match(/_(original|medium|small|thumbnail)\.png$/)?.[1]).sort()).toEqual([
				'medium',
				'original',
				'small',
				'thumbnail',
			]);
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
		expect(anonymousDetail).toMatchObject({
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
		expect(await favoritesResponse.json()).toEqual([
			expect.objectContaining({ id: itemId, title: itemBody.commons.title, published: true }),
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
		expect(await buyerMessageResponse.json()).toMatchObject({
			chat_room_id: roomId,
			sender_id: actors.buyer.profile.id,
			message: buyerText,
			message_type: 'text',
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
		expect(await sellerMessageResponse.json()).toMatchObject({
			chat_room_id: roomId,
			sender_id: actors.seller.profile.id,
			message: sellerText,
			message_type: 'text',
		});
		const buyerMessageEmail = await waitForEmail(actors.buyer.user.email, 'Tantovale - New message received');
		expect(buyerMessageEmail.HTML).toContain(sellerText);

		const quoteResponse = await authenticatedRequest(
			'/shipment_provider/auth/calculate_shipment_cost',
			'POST',
			actors.buyer.jar,
			{ item_id: itemId },
		);
		expect(quoteResponse.status).toBe(200);
		const quote = ((await quoteResponse.json()) as { rates: ShippingQuoteResponse[] }).rates[0];
		expect(quote).toMatchObject({ amount: '7.50', currency: 'EUR', shipment_label_id: 'shipment-test' });
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
		expect(proposalBody.proposal).toMatchObject({
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
		expect(accepted).toMatchObject({
			proposal: { id: proposalBody.proposal.id, status: ORDER_PROPOSAL_PHASES.accepted },
			order: { id: expect.any(Number) },
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
		expect(buyerOrder).toMatchObject({
			id: accepted.order.id,
			item_id: itemId,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_transaction_id: expectedTransactionId,
			item_price: 10_000,
		});
		expect(buyerOrder.payment_url).toEqual(
			expect.stringContaining(`/online/transactions/${expectedTransactionId}/guest_pay`),
		);
		expect(sellerOrder).toMatchObject({ id: accepted.order.id, status: ORDER_PHASES.PAYMENT_PENDING });
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
		expect(itemGraph).toMatchObject({
			id: itemId,
			profile_id: actors.seller.profile.id,
			address_id: actors.seller.address.id,
			subcategory_id: actors.catalog.childSubcategory.id,
			published: true,
			status: 'available',
			author: { id: actors.seller.profile.id, user_id: actors.seller.user.id },
			address: { id: actors.seller.address.id, profile_id: actors.seller.profile.id },
			subcategory: { id: actors.catalog.childSubcategory.id },
		});
		expect(itemGraph?.itemsImages).toHaveLength(4);
		expect(itemGraph?.itemsImages.map(({ size }) => size).sort()).toEqual(['medium', 'original', 'small', 'thumbnail']);
		expect(itemGraph?.propertyValues).toHaveLength(4);
		expect(
			await db
				.select()
				.from(profiles_items_favorites)
				.where(
					and(
						eq(profiles_items_favorites.profile_id, actors.buyer.profile.id),
						eq(profiles_items_favorites.item_id, itemId),
					),
				),
		).toHaveLength(1);
		const [room] = await db.select().from(chat_rooms).where(eq(chat_rooms.id, roomId));
		expect(room).toMatchObject({ item_id: itemId, buyer_id: actors.buyer.profile.id });
		const storedMessages = await db
			.select()
			.from(chat_messages)
			.where(eq(chat_messages.chat_room_id, roomId))
			.orderBy(asc(chat_messages.id));
		expect(storedMessages.map(({ message_type }) => message_type)).toEqual(['text', 'text', 'proposal', 'system']);
		expect(storedMessages.slice(0, 3).map(({ message }) => message)).toEqual([buyerText, sellerText, proposalMessage]);
		expect(storedMessages[0]?.sender_id).toBe(actors.buyer.profile.id);
		expect(storedMessages[1]?.sender_id).toBe(actors.seller.profile.id);
		expect(storedMessages[2]?.order_proposal_id).toBe(proposalBody.proposal.id);
		expect(storedMessages[3]?.metadata).toEqual({ order_id: accepted.order.id, type: 'proposal_accepted' });

		const [storedProposal] = await db
			.select()
			.from(orders_proposals)
			.where(eq(orders_proposals.id, proposalBody.proposal.id));
		expect(storedProposal).toMatchObject({
			item_id: itemId,
			profile_id: actors.buyer.profile.id,
			status: ORDER_PROPOSAL_PHASES.accepted,
			proposal_price: 10_000,
			shipping_label_id: 'shipment-test',
			shipping_quote_id: quote!.shipping_quote_id,
			shipping_price: 750,
			platform_charge: 90,
			payment_provider_charge: 505,
		});
		const [storedQuote] = await db
			.select()
			.from(shipping_quotes)
			.where(eq(shipping_quotes.id, quote!.shipping_quote_id));
		expect(storedQuote).toMatchObject({
			item_id: itemId,
			buyer_profile_id: actors.buyer.profile.id,
			seller_profile_id: actors.seller.profile.id,
			buyer_address_id: actors.buyer.address.id,
			seller_address_id: actors.seller.address.id,
			shippo_shipment_id: 'shipment-test',
			amount: 750,
			currency: 'EUR',
			consumed_at: expect.any(Date),
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
		expect(orderGraph).toMatchObject({
			id: accepted.order.id,
			item_id: itemId,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			order_proposal_id: proposalBody.proposal.id,
			item_price: 10_000,
			shipping_label_id: 'shipment-test',
			shipping_quote_id: quote!.shipping_quote_id,
			shipping_price: 750,
			platform_charge: 90,
			payment_provider_charge: 505,
			payment_transaction_id: String(expectedTransactionId),
			payment_creation_state: 'created',
			payment_cancellation_state: 'none',
			status: ORDER_PHASES.PAYMENT_PENDING,
			addressBuyerAddress: { id: actors.buyer.address.id, profile_id: actors.buyer.profile.id },
			addressSellerAddress: { id: actors.seller.address.id, profile_id: actors.seller.profile.id },
			buyer: { id: actors.buyer.profile.id },
			item: { id: itemId },
			seller: { id: actors.seller.profile.id },
			paymentInvitation: {
				order_id: accepted.order.id,
				transaction_id: String(expectedTransactionId),
				recipient_email: actors.buyer.user.email,
				merchant_username: actors.seller.user.username,
				item_name: itemBody.commons.title,
				state: PAYMENT_INVITATION_STATES.SENT,
				attempt_count: 1,
			},
		});
		expect(orderGraph?.payment_attempt_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(await db.select().from(orders).where(eq(orders.item_id, itemId))).toHaveLength(1);
		expect(
			await db
				.select()
				.from(payment_invitation_outbox)
				.where(eq(payment_invitation_outbox.order_id, accepted.order.id)),
		).toHaveLength(1);
		const providerRows = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.entityId, itemId));
		expect(providerRows).toEqual([
			expect.objectContaining({
				transactionId: String(expectedTransactionId),
				buyerId: actors.buyer.profile.payment_provider_id,
				sellerId: actors.seller.profile.payment_provider_id,
				price: 10_090,
				charge: 505,
				currency: 'eur',
				status: 'created',
				quarantined: false,
			}),
		]);
		expect(await db.select().from(items_images).where(eq(items_images.item_id, itemId))).toHaveLength(4);
		expect(
			await db.select().from(items_properties_values).where(eq(items_properties_values.item_id, itemId)),
		).toHaveLength(4);

		const shippoRequests = await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'));
		expect(shippoRequests.map(({ method, path }) => `${method} ${path}`)).toEqual([
			'POST /shipments',
			'GET /shipments/shipment-test',
			'GET /shipments/shipment-test',
		]);
		expect(shippoRequests[0]?.body).toMatchObject({
			async: false,
			metadata: `tvq1:${quote!.shipping_quote_id}`,
			address_from: {
				email: actors.seller.user.email,
				phone: actors.seller.address.phone,
			},
			address_to: {
				email: actors.buyer.user.email,
				phone: actors.buyer.address.phone,
			},
			parcels: [
				{
					mass_unit: SHIPPING_UNITS.MASS,
					distance_unit: SHIPPING_UNITS.DISTANCE,
					weight: String(itemBody.shipping!.item_weight),
					height: String(itemBody.shipping!.item_height),
					length: String(itemBody.shipping!.item_length),
					width: String(itemBody.shipping!.item_width),
				},
			],
		});
		const trustapRequests = await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'));
		expect(trustapRequests.map(({ method, path }) => `${method} ${path.split('?')[0]}`)).toEqual([
			'GET /api/v1/charge',
			'GET /api/v1/charge',
			'POST /api/v1/me/transactions/create_with_guest_user',
		]);
		const expectedChargePath = '/api/v1/charge?price=10090&currency=eur&postage_fee=750&use_hr_post=false';
		expect(trustapRequests[0]?.path).toBe(expectedChargePath);
		expect(trustapRequests[1]?.path).toBe(expectedChargePath);
		expect(trustapRequests[2]).toMatchObject({
			headers: { 'trustap-user': actors.seller.profile.payment_provider_id },
			body: {
				buyer_id: actors.buyer.profile.payment_provider_id,
				seller_id: actors.seller.profile.payment_provider_id,
				creator_role: 'seller',
				price: 10_090,
				postage_fee: 750,
				charge: 505,
				features: ['use_custom_postage_fee'],
			},
		});
		expect((trustapRequests[2]?.body as { description?: string }).description).toContain(
			orderGraph?.payment_attempt_id,
		);
	});
});
