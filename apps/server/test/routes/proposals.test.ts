import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { itemStatus, ORDER_PROPOSAL_PHASES, ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import {
	chat_messages,
	chat_rooms,
	entityTrustapTransactions,
	items,
	orders,
	orders_proposals,
} from '../../src/database/schemas/schema';
import {
	createCommerceActors,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
	type CommerceActorGraph,
} from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { waitForEmail } from '../helpers/mailpit';
import { getProviderRequests } from '../helpers/providers';
import type { CookieJar } from '../helpers/request';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';

function providerUrl(name: 'PAYMENT_PROVIDER_API_URL' | 'SHIPPING_PROVIDER_API_URL'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}`);
	const parsed = new URL(value);
	if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') throw new Error(`Unsafe ${name}`);
	return value;
}

async function createShipment(actors: CommerceActorGraph, itemId: number): Promise<string> {
	const response = await authenticatedRequest(
		'/shipment_provider/auth/calculate_shipment_cost',
		'POST',
		actors.buyer.jar,
		{ item_id: itemId },
	);
	expect(response.status).toBe(200);
	const body = (await response.json()) as { rates: Array<{ amount: string; shipment_label_id: string }> };
	expect(body.rates[0]).toMatchObject({ amount: '7.50', shipment_label_id: 'shipment-test' });
	return body.rates[0]!.shipment_label_id;
}

async function createRoom(actors: CommerceActorGraph, itemId: number): Promise<number> {
	const response = await authenticatedRequest('/chat/auth/rooms', 'POST', actors.buyer.jar, { item_id: itemId });
	expect(response.status).toBe(200);
	return ((await response.json()) as { id: number }).id;
}

async function createProposal(
	actors: CommerceActorGraph,
	itemId: number,
	overrides: Partial<{ item_id: number; proposal_price: number; shipping_label_id: string; message: string }> = {},
): Promise<Response> {
	const shippingLabelId = overrides.shipping_label_id ?? (await createShipment(actors, itemId));
	return authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
		item_id: itemId,
		proposal_price: 10_000,
		shipping_label_id: shippingLabelId,
		message: 'Posso offrirti cento euro per questo articolo?',
		...overrides,
	});
}

async function updateProposal(
	jar: CookieJar,
	proposalId: number,
	itemId: number,
	status: 'accepted' | 'rejected',
): Promise<Response> {
	return authenticatedRequest('/orders_proposals/auth', 'PUT', jar, {
		id: proposalId,
		item_id: itemId,
		status,
	});
}

async function rowsForProposal(proposalId: number) {
	const { db } = getTestDatabase();
	return db.select().from(chat_messages).where(eq(chat_messages.order_proposal_id, proposalId));
}

describe('proposal routes', () => {
	it.each([
		[
			'POST',
			'/orders_proposals/auth/create',
			{ item_id: 1, proposal_price: 100, shipping_label_id: 'x', message: 'x' },
		],
		['PUT', '/orders_proposals/auth', { id: 1, item_id: 1, status: 'accepted' }],
		['POST', '/orders_proposals/auth/buyer_aborted_proposal', { proposal_id: 1 }],
		['GET', '/orders_proposals/auth/1', undefined],
		['GET', '/orders_proposals/auth/by_item/1', undefined],
	] as const)('requires authentication for %s %s', async (method, path, body) => {
		const response = await app.request(path, {
			method,
			headers: body === undefined ? undefined : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		expect(response.status).toBe(401);
	});

	it('creates a pending proposal with exact costs, parent shipment, chat message, and seller mail', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const response = await createProposal(actors, item.id);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			proposal: {
				id: number;
				item_id: number;
				profile_id: number;
				status: string;
				proposal_price: number;
				shipping_label_id: string;
				shipping_price?: number;
				platform_charge: number;
				payment_provider_charge: number;
			};
			chatRoomId: number;
		};
		expect(body.proposal).toMatchObject({
			item_id: item.id,
			profile_id: actors.buyer.profile.id,
			status: ORDER_PROPOSAL_PHASES.pending,
			proposal_price: 10_000,
			shipping_label_id: 'shipment-test',
			platform_charge: 60,
			payment_provider_charge: 503,
		});
		expect(body.chatRoomId).toEqual(expect.any(Number));

		const { db } = getTestDatabase();
		const [stored] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, body.proposal.id));
		expect(stored).toMatchObject({
			id: body.proposal.id,
			item_id: body.proposal.item_id,
			profile_id: body.proposal.profile_id,
			status: body.proposal.status,
			proposal_price: body.proposal.proposal_price,
			shipping_label_id: body.proposal.shipping_label_id,
			platform_charge: body.proposal.platform_charge,
			payment_provider_charge: body.proposal.payment_provider_charge,
		});
		const [room] = await db.select().from(chat_rooms).where(eq(chat_rooms.id, body.chatRoomId));
		expect(room).toMatchObject({ item_id: item.id, buyer_id: actors.buyer.profile.id });
		const messages = await rowsForProposal(body.proposal.id);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			chat_room_id: body.chatRoomId,
			sender_id: actors.buyer.profile.id,
			message_type: 'proposal',
		});
		const email = await waitForEmail(
			actors.seller.user.email,
			`Tantovale - Proposal received from ${actors.buyer.user.username}`,
		);
		expect(email.HTML).toContain('Posso offrirti cento euro');

		const trustapRequests = await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'));
		expect(trustapRequests).toHaveLength(1);
		expect(trustapRequests[0]?.path).toBe('/api/v1/charge?price=10060&currency=eur&postage_fee=750&use_hr_post=false');
		const shippoRequests = await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'));
		expect(shippoRequests.map(({ method, path }) => `${method} ${path}`)).toEqual([
			'POST /shipments',
			'GET /shipments/shipment-test',
		]);
	});

	it.each([
		{ item_id: 0, proposal_price: 10_000, shipping_label_id: 'shipment-test', message: 'x' },
		{ item_id: 1.5, proposal_price: 10_000, shipping_label_id: 'shipment-test', message: 'x' },
		{ item_id: 2_147_483_648, proposal_price: 10_000, shipping_label_id: 'shipment-test', message: 'x' },
		{ item_id: 1, proposal_price: 0, shipping_label_id: 'shipment-test', message: 'x' },
		{ item_id: 1, proposal_price: 10_000.5, shipping_label_id: 'shipment-test', message: 'x' },
	])('rejects malformed create payload %j', async (body) => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, body);
		expect(response.status).toBe(400);
	});

	it('rejects absent, own, unavailable, unpublished, deleted, duplicate-pending, and active-order proposals', async () => {
		const absentActors = await createCommerceActors();
		const absent = await authenticatedRequest('/orders_proposals/auth/create', 'POST', absentActors.buyer.jar, {
			item_id: 2_147_483_647,
			proposal_price: 10_000,
			shipping_label_id: 'shipment-test',
			message: 'absent',
		});
		expect(absent.status).toBe(404);

		const ownActors = await createCommerceActors();
		const ownItem = await createItemFixture(ownActors);
		const ownShipment = await createShipment(ownActors, ownItem.id);
		const own = await authenticatedRequest('/orders_proposals/auth/create', 'POST', ownActors.seller.jar, {
			item_id: ownItem.id,
			proposal_price: 10_000,
			shipping_label_id: ownShipment,
			message: 'own',
		});
		expect(own.status).toBe(400);

		for (const state of ['unavailable', 'unpublished', 'deleted'] as const) {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors, { commons: { title: `${state} proposal item` } });
			const { db } = getTestDatabase();
			await db
				.update(items)
				.set(
					state === 'unavailable'
						? { status: itemStatus.SOLD }
						: state === 'unpublished'
							? { published: false }
							: { deleted_at: new Date() },
				)
				.where(eq(items.id, item.id));
			const response = await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
				item_id: item.id,
				proposal_price: 10_000,
				shipping_label_id: 'shipment-test',
				message: state,
			});
			expect(response.status).toBe(404);
		}

		const duplicateActors = await createCommerceActors();
		const duplicateItem = await createItemFixture(duplicateActors);
		await createProposalFixture(duplicateActors, duplicateItem);
		const duplicate = await authenticatedRequest('/orders_proposals/auth/create', 'POST', duplicateActors.buyer.jar, {
			item_id: duplicateItem.id,
			proposal_price: 10_000,
			shipping_label_id: 'shipment-test',
			message: 'duplicate',
		});
		expect(duplicate.status).toBe(400);

		const orderedActors = await createCommerceActors();
		const orderedItem = await createItemFixture(orderedActors);
		await createOrderFixture(orderedActors, orderedItem);
		const ordered = await authenticatedRequest('/orders_proposals/auth/create', 'POST', orderedActors.buyer.jar, {
			item_id: orderedItem.id,
			proposal_price: 10_000,
			shipping_label_id: 'shipment-test',
			message: 'ordered',
		});
		expect(ordered.status).toBe(400);

		const fullPriceActors = await createCommerceActors();
		const fullPriceItem = await createItemFixture(fullPriceActors, { commons: { title: 'Full price proposal item' } });
		const fullPrice = await authenticatedRequest('/orders_proposals/auth/create', 'POST', fullPriceActors.buyer.jar, {
			item_id: fullPriceItem.id,
			proposal_price: fullPriceItem.price,
			shipping_label_id: 'shipment-test',
			message: 'full price',
		});
		expect(fullPrice.status).toBe(400);
	});

	it.each([
		{ id: 0, item_id: 1, status: ORDER_PROPOSAL_PHASES.accepted },
		{ id: 1, item_id: 0, status: ORDER_PROPOSAL_PHASES.accepted },
		{ id: 1.5, item_id: 1, status: ORDER_PROPOSAL_PHASES.accepted },
		{ id: 1, item_id: 1, status: ORDER_PROPOSAL_PHASES.pending },
	])('rejects malformed seller update payload $id/$item_id/$status', async (body) => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest('/orders_proposals/auth', 'PUT', actors.seller.jar, body);
		expect(response.status).toBe(400);
	});

	it.each([0, -1, 1.5, 2_147_483_648])('rejects malformed buyer-abort proposal id %s', async (proposalId) => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest(
			'/orders_proposals/auth/buyer_aborted_proposal',
			'POST',
			actors.buyer.jar,
			{ proposal_id: proposalId },
		);
		expect(response.status).toBe(400);
	});

	it('returns non-disclosing 404s for absent numeric proposal resources', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const responses = await Promise.all([
			updateProposal(actors.seller.jar, 2_147_483_647, item.id, 'rejected'),
			authenticatedRequest('/orders_proposals/auth/buyer_aborted_proposal', 'POST', actors.buyer.jar, {
				proposal_id: 2_147_483_647,
			}),
			authenticatedRequest('/orders_proposals/auth/2147483647', 'GET', actors.buyer.jar),
			authenticatedRequest('/orders_proposals/auth/by_item/2147483647', 'GET', actors.buyer.jar),
		]);
		expect(responses.map(({ status }) => status)).toEqual([404, 404, 404, 404]);
	});

	it.each(['0', '-1', '1.5', '2147483648'])(
		'rejects malformed proposal item id %s and invalid status filters',
		async (itemId) => {
			const actors = await createCommerceActors();
			const malformed = await authenticatedRequest(`/orders_proposals/auth/by_item/${itemId}`, 'GET', actors.buyer.jar);
			expect(malformed.status).toBe(400);
			const invalidStatus = await authenticatedRequest(
				`/orders_proposals/auth/by_item/1?status=not-a-status`,
				'GET',
				actors.buyer.jar,
			);
			expect(invalidStatus.status).toBe(400);
		},
	);

	it('lets only the item seller reject a matching pending proposal, with system chat and mail but no order', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const roomId = await createRoom(actors, item.id);
		const proposal = await createProposalFixture(actors, item);

		for (const actor of [actors.buyer, actors.outsider]) {
			const forbidden = await updateProposal(actor.jar, proposal.id, item.id, 'rejected');
			expect(forbidden.status).toBe(404);
		}

		const response = await updateProposal(actors.seller.jar, proposal.id, item.id, 'rejected');
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			message: 'Proposal updated successfully',
			proposal: { id: proposal.id, status: ORDER_PROPOSAL_PHASES.rejected },
		});
		const { db } = getTestDatabase();
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toEqual([]);
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toEqual([]);
		const messages = await db
			.select()
			.from(chat_messages)
			.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system')));
		expect(messages).toHaveLength(1);
		expect(messages[0]?.metadata).toEqual({ type: 'proposal_rejected' });
		await waitForEmail(actors.buyer.user.email, 'Tantovale - Proposal rejected');
	});

	it('binds seller updates to the proposal item and rejects non-pending transitions', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const otherItem = await createItemFixture(actors, { commons: { title: 'Other seller item' } });
		await createRoom(actors, item.id);
		await createRoom(actors, otherItem.id);
		const proposal = await createProposalFixture(actors, item);

		const wrongItem = await updateProposal(actors.seller.jar, proposal.id, otherItem.id, 'rejected');
		expect(wrongItem.status).toBe(404);

		const { db } = getTestDatabase();
		await db
			.update(orders_proposals)
			.set({ status: ORDER_PROPOSAL_PHASES.buyer_aborted })
			.where(eq(orders_proposals.id, proposal.id));
		const terminal = await updateProposal(actors.seller.jar, proposal.id, item.id, 'rejected');
		expect(terminal.status).toBe(404);
	});

	it('accepts once, creating one provider transaction, complete order graph, and accepted system message', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const shippingLabelId = await createShipment(actors, item.id);
		const roomId = await createRoom(actors, item.id);
		const proposal = await createProposalFixture(actors, item, {
			shipping_label_id: shippingLabelId,
			proposal_price: 10_000,
			platform_charge: 60,
			payment_provider_charge: 503,
		});

		const response = await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			proposal: { id: number; status: string };
			order: { id: number };
			transaction: { id: number; status: string };
		};
		expect(body.proposal).toMatchObject({ id: proposal.id, status: ORDER_PROPOSAL_PHASES.accepted });
		expect(body.order.id).toEqual(expect.any(Number));
		expect(body.transaction).toMatchObject({ id: expect.any(Number), status: 'created' });

		const { db } = getTestDatabase();
		const [order] = await db.select().from(orders).where(eq(orders.id, body.order.id));
		expect(order).toMatchObject({
			item_id: item.id,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			status: ORDER_PHASES.PAYMENT_PENDING,
			shipping_price: 750,
			shipping_label_id: 'shipment-test',
		});
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toHaveLength(1);
		const [systemMessage] = await db
			.select()
			.from(chat_messages)
			.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system')));
		expect(systemMessage?.metadata).toEqual({ order_id: body.order.id, type: 'proposal_accepted' });
		await waitForEmail(actors.buyer.user.email, 'Tantovale - Proposal accepted');

		const second = await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
		expect(second.status).toBe(404);
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toHaveLength(1);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(1);
		expect(transactionRequests[0]).toMatchObject({
			headers: { 'trustap-user': actors.seller.profile.payment_provider_id },
			body: {
				buyer_id: actors.buyer.profile.payment_provider_id,
				seller_id: actors.seller.profile.payment_provider_id,
				creator_role: 'seller',
				price: 10_060,
				postage_fee: 750,
				charge: 503,
			},
		});
	});

	it('leaves a proposal pending and no local payment graph when Trustap transaction creation fails', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const shippingLabelId = await createShipment(actors, item.id);
		await createRoom(actors, item.id);
		const proposal = await createProposalFixture(actors, item, {
			shipping_label_id: shippingLabelId,
			proposal_price: 10_000,
			platform_charge: 60,
		});
		const scenarioResponse = await fetch(`${providerUrl('PAYMENT_PROVIDER_API_URL')}/__test/scenario`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ scenario: 'transaction-error' }),
			signal: AbortSignal.timeout(2_000),
		});
		expect(scenarioResponse.status).toBe(200);

		const response = await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
		expect(response.status).toBe(500);
		const { db } = getTestDatabase();
		const [stored] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(stored?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toEqual([]);
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toEqual([]);
	});

	it('serializes proposal acceptance against buy-now into one order and one provider transaction', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const shippingLabelId = await createShipment(actors, item.id);
		await createRoom(actors, item.id);
		const proposal = await createProposalFixture(actors, item, {
			shipping_label_id: shippingLabelId,
			proposal_price: 10_000,
			platform_charge: 60,
			payment_provider_charge: 503,
		});

		const [acceptResponse, buyNowResponse] = await Promise.all([
			updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted'),
			authenticatedRequest('/item/auth/buy_now', 'POST', actors.buyer.jar, { item_id: item.id }),
		]);
		expect([acceptResponse.status, buyNowResponse.status].sort()).toEqual([200, 400]);

		const { db } = getTestDatabase();
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toHaveLength(1);
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toHaveLength(1);
		const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(storedProposal?.status).toBe(
			acceptResponse.status === 200 ? ORDER_PROPOSAL_PHASES.accepted : ORDER_PROPOSAL_PHASES.pending,
		);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(1);
	});

	it('keeps an accepted-proposal reservation and blocks retry if final local persistence fails', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const conflictingItem = await createItemFixture(actors, {
			commons: { title: 'Proposal transaction conflict item' },
		});
		const shippingLabelId = await createShipment(actors, item.id);
		await createRoom(actors, item.id);
		const proposal = await createProposalFixture(actors, item, {
			shipping_label_id: shippingLabelId,
			proposal_price: 10_000,
			platform_charge: 60,
		});
		const expectedTransactionId = trustapTransactionFixture.id + 1;
		const { db } = getTestDatabase();
		await db.insert(entityTrustapTransactions).values({
			entityId: conflictingItem.id,
			sellerId: actors.seller.profile.payment_provider_id,
			buyerId: actors.buyer.profile.payment_provider_id,
			transactionId: expectedTransactionId,
			status: 'created',
			price: 1,
			charge: 0,
			chargeSeller: 0,
			entityTitle: conflictingItem.title,
		});

		const response = await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
		expect(response.status).toBe(500);
		const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(storedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
		const reservations = await db.select().from(orders).where(eq(orders.item_id, item.id));
		expect(reservations).toHaveLength(1);
		expect(reservations[0]).toMatchObject({
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_transaction_id: null,
		});
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toEqual([]);
		const abortWhileReconciling = await authenticatedRequest(
			'/orders_proposals/auth/buyer_aborted_proposal',
			'POST',
			actors.buyer.jar,
			{ proposal_id: proposal.id },
		);
		expect(abortWhileReconciling.status).toBe(400);
		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'rejected')).status).toBe(400);

		const retry = await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
		expect(retry.status).toBe(400);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(1);
	});

	it('allows only the proposal buyer to abort while pending', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const roomId = await createRoom(actors, item.id);
		const proposal = await createProposalFixture(actors, item);

		for (const actor of [actors.seller, actors.outsider]) {
			const forbidden = await authenticatedRequest('/orders_proposals/auth/buyer_aborted_proposal', 'POST', actor.jar, {
				proposal_id: proposal.id,
			});
			expect(forbidden.status).toBe(404);
		}

		const response = await authenticatedRequest(
			'/orders_proposals/auth/buyer_aborted_proposal',
			'POST',
			actors.buyer.jar,
			{ proposal_id: proposal.id },
		);
		expect(response.status).toBe(200);
		const { db } = getTestDatabase();
		const [stored] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(stored?.status).toBe(ORDER_PROPOSAL_PHASES.buyer_aborted);
		const [message] = await db
			.select()
			.from(chat_messages)
			.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system')));
		expect(message?.metadata).toEqual({ type: 'proposal_buyer_aborted' });
		await waitForEmail(actors.seller.user.email, `Tantovale - Proposal #${proposal.id} cancelled`);

		const repeated = await authenticatedRequest(
			'/orders_proposals/auth/buyer_aborted_proposal',
			'POST',
			actors.buyer.jar,
			{ proposal_id: proposal.id },
		);
		expect(repeated.status).toBe(404);
	});

	it.each(['missing', '0', '-1', '1.5', '2147483648'])('rejects malformed proposal id %s', async (id) => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest(`/orders_proposals/auth/${id}`, 'GET', actors.buyer.jar);
		expect(response.status).toBe(400);
	});

	it('reads a proposal by id only for its buyer and item seller', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const proposal = await createProposalFixture(actors, item);

		for (const actor of [actors.buyer, actors.seller]) {
			const response = await authenticatedRequest(`/orders_proposals/auth/${proposal.id}`, 'GET', actor.jar);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				id: proposal.id,
				status: proposal.status,
				proposal_price: proposal.proposal_price,
			});
		}

		const outsider = await authenticatedRequest(`/orders_proposals/auth/${proposal.id}`, 'GET', actors.outsider.jar);
		expect(outsider.status).toBe(404);
	});

	it('reads by item for participants, supports optional status, and hides unrelated proposals', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const proposal = await createProposalFixture(actors, item);

		for (const actor of [actors.buyer, actors.seller]) {
			for (const suffix of ['', `?status=${ORDER_PROPOSAL_PHASES.pending}`]) {
				const response = await authenticatedRequest(
					`/orders_proposals/auth/by_item/${item.id}${suffix}`,
					'GET',
					actor.jar,
				);
				expect(response.status).toBe(200);
				expect(await response.json()).toMatchObject({ id: proposal.id, status: proposal.status });
			}
		}

		const outsider = await authenticatedRequest(
			`/orders_proposals/auth/by_item/${item.id}`,
			'GET',
			actors.outsider.jar,
		);
		expect(outsider.status).toBe(404);
		const mismatched = await authenticatedRequest(
			`/orders_proposals/auth/by_item/${item.id}?status=${ORDER_PROPOSAL_PHASES.rejected}`,
			'GET',
			actors.buyer.jar,
		);
		expect(mismatched.status).toBe(404);
	});
});
