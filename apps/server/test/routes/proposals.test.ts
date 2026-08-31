import { and, eq, lt } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app';
import {
	entityTrustapTransactionTypeValues,
	itemStatus,
	ORDER_PROPOSAL_PHASES,
	ORDER_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
	PAYMENT_INVITATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import { itemCommerceLockScope } from '../../src/lib/item-commerce-lock';
import { TransactionSyncService } from '../../src/routes/payments/transaction-sync.service';
import { PaymentInvitationOutboxService } from '../../src/routes/payments/payment-invitation-outbox.service';
import { PaymentProviderService } from '../../src/routes/payments/payment-provider.service';
import { environment } from '../../src/utils/constants';
import {
	addresses,
	categories,
	chat_messages,
	chat_rooms,
	cities,
	commerce_reconciliation_audit,
	entityTrustapTransactions,
	items,
	orders,
	orders_proposals,
	payment_invitation_outbox,
	profiles,
	shipping_quotes,
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
import { getProviderRequests, setProviderScenario, setTrustapTransactionStatus } from '../helpers/providers';
import type { CookieJar } from '../helpers/request';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';

function providerUrl(name: 'PAYMENT_PROVIDER_API_URL' | 'SHIPPING_PROVIDER_API_URL'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}`);
	const parsed = new URL(value);
	if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') throw new Error(`Unsafe ${name}`);
	return value;
}

async function proposalAcceptedMailCount(recipient: string): Promise<number> {
	/* eslint-disable-next-line turbo/no-undeclared-env-vars -- Worker-local Mailpit is supplied by the test harness. */
	const origin = process.env.MAILPIT_API_URL;
	if (!origin) throw new Error('Missing worker-local Mailpit URL');
	const url = new URL('/api/v1/search', origin);
	url.searchParams.set('query', `to:${recipient}`);
	const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
	if (!response.ok) throw new Error(`Mailpit search failed with ${response.status}`);
	const body = (await response.json()) as { messages: Array<{ Subject: string }> };
	return body.messages.filter(({ Subject }) => Subject === 'Tantovale - Proposal accepted').length;
}

type CreatedShippingQuote = {
	amount: string;
	currency: string;
	shipment_label_id: string;
	shipping_quote_id: string;
};

async function createShippingQuote(actors: CommerceActorGraph, itemId: number): Promise<CreatedShippingQuote> {
	const response = await authenticatedRequest(
		'/shipment_provider/auth/calculate_shipment_cost',
		'POST',
		actors.buyer.jar,
		{ item_id: itemId },
	);
	expect(response.status).toBe(200);
	const body = (await response.json()) as { rates: CreatedShippingQuote[] };
	expect(body.rates[0]).toMatchObject({
		amount: '7.50',
		currency: 'EUR',
		shipment_label_id: expect.stringMatching(/^shipment-test(?:-\d+)?$/),
		shipping_quote_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
	});
	return body.rates[0]!;
}

async function createShipment(actors: CommerceActorGraph, itemId: number): Promise<string> {
	return (await createShippingQuote(actors, itemId)).shipment_label_id;
}

async function createRoom(actors: CommerceActorGraph, itemId: number): Promise<number> {
	const response = await authenticatedRequest('/chat/auth/rooms', 'POST', actors.buyer.jar, { item_id: itemId });
	expect(response.status).toBe(200);
	return ((await response.json()) as { id: number }).id;
}

async function createProposal(
	actors: CommerceActorGraph,
	itemId: number,
	overrides: Partial<{
		item_id: number;
		proposal_price: number;
		shipping_label_id: string;
		shipping_quote_id: string;
		message: string;
	}> = {},
): Promise<Response> {
	const generatedQuote =
		overrides.shipping_label_id === undefined ? await createShippingQuote(actors, itemId) : undefined;
	const shippingLabelId = overrides.shipping_label_id ?? generatedQuote!.shipment_label_id;
	return authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
		item_id: itemId,
		proposal_price: 10_000,
		shipping_label_id: shippingLabelId,
		...(generatedQuote ? { shipping_quote_id: generatedQuote.shipping_quote_id } : {}),
		message: 'Posso offrirti cento euro per questo articolo?',
		...overrides,
	});
}

async function createQuotedProposalFixture(
	actors: CommerceActorGraph,
	item: Awaited<ReturnType<typeof createItemFixture>>,
	overrides: Partial<typeof orders_proposals.$inferInsert> = {},
) {
	const quote = await createShippingQuote(actors, item.id);
	const { db } = getTestDatabase();
	await db
		.update(shipping_quotes)
		.set({ consumed_at: new Date() })
		.where(eq(shipping_quotes.id, quote.shipping_quote_id));
	return createProposalFixture(actors, item, {
		shipping_label_id: quote.shipment_label_id,
		shipping_quote_id: quote.shipping_quote_id,
		shipping_price: 750,
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

async function createExistingCreatedRecoveryReservation(title: string) {
	const actors = await createCommerceActors();
	const item = await createItemFixture(actors, { commons: { title } });
	const conflictingItem = await createItemFixture(actors, { commons: { title: `${title} conflict` } });
	await createRoom(actors, item.id);
	const proposal = await createQuotedProposalFixture(actors, item, {
		proposal_price: 10_000,
		platform_charge: 90,
	});
	const transactionId = String(trustapTransactionFixture.id + 1);
	const { db } = getTestDatabase();
	const [provider] = await db
		.insert(entityTrustapTransactions)
		.values({
			entityId: conflictingItem.id,
			sellerId: 'conflicting-seller',
			buyerId: 'conflicting-buyer',
			transactionId,
			status: 'created',
			price: 1,
			charge: 0,
			chargeSeller: 0,
			entityTitle: conflictingItem.title,
		})
		.returning();
	if ((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status !== 500) {
		throw new Error('Expected a conflicting provider row to leave a known-ID recovery reservation');
	}
	const [reservation] = await db.select().from(orders).where(eq(orders.item_id, item.id));
	if (!reservation || !provider) throw new Error('Missing same-status recovery graph');
	await db
		.update(entityTrustapTransactions)
		.set({
			entityId: item.id,
			sellerId: actors.seller.profile.payment_provider_id,
			buyerId: actors.buyer.profile.payment_provider_id,
			price: reservation.item_price + reservation.platform_charge,
			charge: reservation.payment_provider_charge,
			chargeSeller: 0,
			currency: 'eur',
			entityTitle: item.title,
		})
		.where(eq(entityTrustapTransactions.id, provider.id));
	return { actors, item, proposal, provider, reservation, transactionId };
}

async function waitForProviderRequest(url: string, method: string, path: string): Promise<void> {
	const deadline = Date.now() + 2_000;
	do {
		if ((await getProviderRequests(url)).some((request) => request.method === method && request.path === path)) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	} while (Date.now() < deadline);
	throw new Error(`Timed out waiting for ${method} ${path}`);
}

async function waitForBlockedRequests(blockingProcessId: number, expectedCount: number): Promise<void> {
	const observer = await getTestDatabase().client.connect();
	try {
		const deadline = Date.now() + 3_000;
		do {
			const { rows } = await observer.query<{ blockers: number[] }>(
				`SELECT pg_blocking_pids(pid) AS blockers
				 FROM pg_stat_activity
				 WHERE datname = current_database()`,
			);
			const blockedCount = rows.filter(({ blockers }) => blockers.includes(blockingProcessId)).length;
			if (blockedCount >= expectedCount) return;
			await new Promise((resolve) => setTimeout(resolve, 20));
		} while (Date.now() < deadline);
		throw new Error(`Timed out waiting for ${expectedCount} item-commerce lock waiters`);
	} finally {
		observer.release();
	}
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
				shipping_quote_id: string;
				shipping_price: number;
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
			shipping_quote_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
			shipping_price: 750,
			platform_charge: 90,
			payment_provider_charge: 505,
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
			shipping_quote_id: body.proposal.shipping_quote_id,
			shipping_price: body.proposal.shipping_price,
			platform_charge: body.proposal.platform_charge,
			payment_provider_charge: body.proposal.payment_provider_charge,
		});
		const [quote] = await db
			.select()
			.from(shipping_quotes)
			.where(eq(shipping_quotes.id, body.proposal.shipping_quote_id));
		expect(quote).toMatchObject({ consumed_at: expect.any(Date), amount: 750, currency: 'EUR' });
		expect(quote?.expires_at.getTime() ?? 0).toBeGreaterThanOrEqual(
			(stored?.created_at.getTime() ?? Number.POSITIVE_INFINITY) + 96 * 60 * 60 * 1_000 - 2_000,
		);
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
		expect(trustapRequests[0]?.path).toBe('/api/v1/charge?price=10090&currency=eur&postage_fee=750&use_hr_post=false');
		const shippoRequests = await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'));
		expect(shippoRequests.map(({ method, path }) => `${method} ${path}`)).toEqual([
			'POST /shipments',
			'GET /shipments/shipment-test',
		]);
	});

	it('persists a newly provisioned buyer identity before downstream proposal failure and reuses it on retry', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const quote = await createShippingQuote(actors, item.id);
		const { db } = getTestDatabase();
		await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.buyer.profile.id));
		await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), 'charge-error');
		const payload = {
			item_id: item.id,
			proposal_price: 10_000,
			shipping_label_id: quote.shipment_label_id,
			shipping_quote_id: quote.shipping_quote_id,
			message: 'Durable identity boundary',
		};
		expect(
			(await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, payload)).status,
		).toBe(500);
		const [afterFailure] = await db.select().from(profiles).where(eq(profiles.id, actors.buyer.profile.id));
		expect(afterFailure?.payment_provider_id).toBe(`guest-${actors.buyer.profile.id}`);
		await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), 'success');
		expect(
			(await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, payload)).status,
		).toBe(200);
		const guestRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/guest_users',
		);
		expect(guestRequests).toHaveLength(1);
	});

	it('does not hold the item commerce lock while waiting on proposal fee calculation', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const quote = await createShippingQuote(actors, item.id);
		await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), 'charge-delay');
		const responsePromise = authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
			item_id: item.id,
			proposal_price: 10_000,
			shipping_label_id: quote.shipment_label_id,
			shipping_quote_id: quote.shipping_quote_id,
			message: 'Provider boundary',
		});
		await waitForProviderRequest(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			'GET',
			'/api/v1/charge?price=10090&currency=eur&postage_fee=750&use_hr_post=false',
		);

		const { client, db } = getTestDatabase();
		const contender = await client.connect();
		try {
			await contender.query('BEGIN');
			const result = await contender.query<{ acquired: boolean }>(
				'SELECT pg_try_advisory_xact_lock(hashtext(current_database() || $1), $2) AS acquired',
				[itemCommerceLockScope, item.id],
			);
			expect(result.rows[0]?.acquired).toBe(true);
		} finally {
			await contender.query('ROLLBACK');
			contender.release();
		}
		expect((await responsePromise).status).toBe(500);
		expect(await db.select().from(orders_proposals).where(eq(orders_proposals.item_id, item.id))).toEqual([]);
	});

	it('atomically consumes a shipping quote once under concurrent proposal creation', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const quote = await createShippingQuote(actors, item.id);
		const payload = {
			item_id: item.id,
			proposal_price: 10_000,
			shipping_label_id: quote.shipment_label_id,
			shipping_quote_id: quote.shipping_quote_id,
			message: 'Consume this quote exactly once',
		};
		const { client, db } = getTestDatabase();
		const blocker = await client.connect();
		let responsesPromise: Promise<Response[]> | undefined;
		try {
			await blocker.query('BEGIN');
			const processResult = await blocker.query<{ process_id: number }>('SELECT pg_backend_pid() AS process_id');
			await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
				itemCommerceLockScope,
				item.id,
			]);
			responsesPromise = Promise.all([
				authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, payload),
				authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, payload),
			]);
			await waitForBlockedRequests(processResult.rows[0]!.process_id, 2);
			await blocker.query('COMMIT');
		} finally {
			if (!responsesPromise) await blocker.query('ROLLBACK');
			blocker.release();
		}
		if (!responsesPromise) throw new Error('Concurrent proposal requests were not started');
		const responses = await responsesPromise;
		expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
		expect(await db.select().from(orders_proposals).where(eq(orders_proposals.item_id, item.id))).toHaveLength(1);
		const [storedQuote] = await db
			.select()
			.from(shipping_quotes)
			.where(eq(shipping_quotes.id, quote.shipping_quote_id));
		expect(storedQuote?.consumed_at).toEqual(expect.any(Date));
	});

	it('creates a synchronous opaque server-bound shipping quote', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const quote = await createShippingQuote(actors, item.id);
		const [request] = await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'));
		expect(request).toMatchObject({ method: 'POST', path: '/shipments' });
		expect(request?.body).toMatchObject({
			async: false,
			metadata: `tvq1:${quote.shipping_quote_id}`,
		});
	});

	it('maps address city and province into distinct Shippo city and state fields', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const { db } = getTestDatabase();
		await db.insert(cities).values({
			id: 77_002,
			name: 'Lombardia Province',
			state_id: actors.catalog.state.id,
			state_code: 'LOM',
			country_id: actors.catalog.country.id,
			country_code: actors.catalog.country.iso2,
			latitude: '45.00000000',
			longitude: '9.00000000',
		});
		await db.update(addresses).set({ province_id: 77_002 }).where(eq(addresses.id, actors.seller.address.id));
		await db.update(addresses).set({ province_id: 77_002 }).where(eq(addresses.id, actors.buyer.address.id));

		await createShippingQuote(actors, item.id);

		const [request] = await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'));
		expect(request?.body).toMatchObject({
			address_from: { city: actors.catalog.actorLocations.seller.city.name, state: 'LOM' },
			address_to: { city: actors.catalog.actorLocations.buyer.city.name, state: 'LOM' },
		});
	});

	it.each([
		'shippo-create-metadata-mismatch',
		'shippo-create-address-mismatch',
		'shippo-create-parcel-mismatch',
		'shippo-create-rate-currency-mismatch',
		'shippo-create-rate-amount-mismatch',
		'shippo-create-rate-shipment-mismatch',
		'shippo-create-status-error',
	] as const)('rejects tampered Shippo creation response %s without persisting a quote', async (scenario) => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await setProviderScenario(providerUrl('SHIPPING_PROVIDER_API_URL'), scenario);

		const response = await authenticatedRequest(
			'/shipment_provider/auth/calculate_shipment_cost',
			'POST',
			actors.buyer.jar,
			{ item_id: item.id },
		);

		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ message: 'Shipping provider request failed' });
		const { db } = getTestDatabase();
		expect(await db.select().from(shipping_quotes).where(eq(shipping_quotes.item_id, item.id))).toEqual([]);
	});

	it('selects the Shippo BESTVALUE rate instead of trusting creation response ordering', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await setProviderScenario(providerUrl('SHIPPING_PROVIDER_API_URL'), 'shippo-create-reordered-rates');

		const quote = await createShippingQuote(actors, item.id);

		expect(quote.amount).toBe('7.50');
		const { db } = getTestDatabase();
		const [stored] = await db.select().from(shipping_quotes).where(eq(shipping_quotes.id, quote.shipping_quote_id));
		expect(stored?.shippo_rate_id).toMatch(/^rate-test/);
		expect(stored?.amount).toBe(750);
	});

	it('bounds a delayed Shippo quote request without persisting a quote', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await setProviderScenario(providerUrl('SHIPPING_PROVIDER_API_URL'), 'shippo-delay');
		const startedAt = Date.now();
		const response = await authenticatedRequest(
			'/shipment_provider/auth/calculate_shipment_cost',
			'POST',
			actors.buyer.jar,
			{ item_id: item.id },
		);
		expect(response.status).toBe(502);
		expect(Date.now() - startedAt).toBeLessThan(1_000);
		const { db } = getTestDatabase();
		expect(await db.select().from(shipping_quotes).where(eq(shipping_quotes.item_id, item.id))).toEqual([]);
	});

	it('rejects a Shippo retrieval whose expanded address no longer matches the server snapshot', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const quote = await createShippingQuote(actors, item.id);
		await setProviderScenario(providerUrl('SHIPPING_PROVIDER_API_URL'), 'shippo-address-mismatch');
		const response = await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
			item_id: item.id,
			proposal_price: 10_000,
			shipping_label_id: quote.shipment_label_id,
			shipping_quote_id: quote.shipping_quote_id,
			message: 'Address-bound quote',
		});
		expect(response.status).toBe(400);
		const { db } = getTestDatabase();
		expect(await db.select().from(orders_proposals).where(eq(orders_proposals.item_id, item.id))).toEqual([]);
	});

	it('selects the persisted Shippo rate by ID even when retrieval rates are reordered', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const quote = await createShippingQuote(actors, item.id);
		await setProviderScenario(providerUrl('SHIPPING_PROVIDER_API_URL'), 'shippo-reordered-rates');
		const response = await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
			item_id: item.id,
			proposal_price: 10_000,
			shipping_label_id: quote.shipment_label_id,
			shipping_quote_id: quote.shipping_quote_id,
			message: 'Persisted rate, not first rate',
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { proposal: { shipping_price: number } };
		expect(body.proposal.shipping_price).toBe(750);
	});

	it('rejects cross-buyer, cross-item, expired, mutated, and replayed shipping quotes', async () => {
		const cases: Array<
			(
				actors: CommerceActorGraph,
				item: Awaited<ReturnType<typeof createItemFixture>>,
				quote: CreatedShippingQuote,
			) => Promise<Response>
		> = [
			async (actors, item, quote) =>
				authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.outsider.jar, {
					item_id: item.id,
					proposal_price: 10_000,
					shipping_label_id: quote.shipment_label_id,
					shipping_quote_id: quote.shipping_quote_id,
					message: 'Cross buyer',
				}),
			async (actors, _item, quote) => {
				const otherItem = await createItemFixture(actors, { commons: { title: 'Cross quote item' } });
				return authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
					item_id: otherItem.id,
					proposal_price: 10_000,
					shipping_label_id: quote.shipment_label_id,
					shipping_quote_id: quote.shipping_quote_id,
					message: 'Cross item',
				});
			},
			async (actors, item, quote) => {
				const { db } = getTestDatabase();
				await db
					.update(shipping_quotes)
					.set({ expires_at: new Date(0) })
					.where(eq(shipping_quotes.id, quote.shipping_quote_id));
				return authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
					item_id: item.id,
					proposal_price: 10_000,
					shipping_label_id: quote.shipment_label_id,
					shipping_quote_id: quote.shipping_quote_id,
					message: 'Expired',
				});
			},
			async (actors, item, quote) => {
				const { db } = getTestDatabase();
				await db.update(items).set({ item_length: 99 }).where(eq(items.id, item.id));
				return authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
					item_id: item.id,
					proposal_price: 10_000,
					shipping_label_id: quote.shipment_label_id,
					shipping_quote_id: quote.shipping_quote_id,
					message: 'Mutated dimensions',
				});
			},
			async (actors, item, quote) => {
				const { db } = getTestDatabase();
				await db
					.update(addresses)
					.set({ street_address: 'A different active buyer address' })
					.where(eq(addresses.id, actors.buyer.address.id));
				return authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
					item_id: item.id,
					proposal_price: 10_000,
					shipping_label_id: quote.shipment_label_id,
					shipping_quote_id: quote.shipping_quote_id,
					message: 'Mutated buyer address',
				});
			},
		];

		for (const runCase of cases) {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const quote = await createShippingQuote(actors, item.id);
			const response = await runCase(actors, item, quote);
			expect(response.status).toBe(400);
			const { db } = getTestDatabase();
			expect(await db.select().from(orders_proposals).where(eq(orders_proposals.item_id, item.id))).toEqual([]);
		}

		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const quote = await createShippingQuote(actors, item.id);
		const payload = {
			item_id: item.id,
			proposal_price: 10_000,
			shipping_label_id: quote.shipment_label_id,
			shipping_quote_id: quote.shipping_quote_id,
			message: 'Replay once',
		};
		expect(
			(await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, payload)).status,
		).toBe(200);
		expect(
			(await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, payload)).status,
		).toBe(400);
	});

	it.each(['', '   \t\n ', 'x'.repeat(601), 'unsafe\u0000message', 'unsafe\u001fmessage'])(
		'rejects an empty, oversized, or unsafe proposal message',
		async (message) => {
			const actors = await createCommerceActors();
			const response = await authenticatedRequest('/orders_proposals/auth/create', 'POST', actors.buyer.jar, {
				item_id: 1,
				proposal_price: 10_000,
				shipping_label_id: 'unused',
				message,
			});
			expect(response.status).toBe(400);
		},
	);

	it('trims safe proposal text, preserves internal whitespace, and HTML-escapes seller mail', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const safeText = '<script>alert("proposal")</script>\n\tOfferta valida';
		const response = await createProposal(actors, item.id, { message: `  ${safeText}  ` });
		expect(response.status).toBe(200);
		const body = (await response.json()) as { proposal: { id: number } };
		const [stored] = await rowsForProposal(body.proposal.id);
		expect(stored?.message).toBe(safeText);
		const email = await waitForEmail(
			actors.seller.user.email,
			`Tantovale - Proposal received from ${actors.buyer.user.username}`,
		);
		expect(email.HTML).toContain('&lt;script&gt;alert(&quot;proposal&quot;)&lt;/script&gt;');
		expect(email.HTML).not.toContain('<script>alert');
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

	it('lets the seller reject without requiring the buyer active address or provider identity', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createProposalFixture(actors, item);
		const { db } = getTestDatabase();
		await db.update(addresses).set({ status: 'inactive' }).where(eq(addresses.id, actors.buyer.address.id));
		await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.buyer.profile.id));

		const response = await updateProposal(actors.seller.jar, proposal.id, item.id, 'rejected');
		expect(response.status).toBe(200);
		const [stored] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(stored?.status).toBe(ORDER_PROPOSAL_PHASES.rejected);
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

	it.each([
		['unavailable item', 400],
		['unpublished item', 400],
		['deleted item', 404],
		['non-Easy-Pay item', 400],
		['unpublished taxonomy', 400],
		['inactive seller address', 404],
		['inactive buyer address', 404],
		['missing seller provider', 404],
		['missing buyer provider', 404],
	] as const)('revalidates %s before accepting a proposal', async (mutation, expectedStatus) => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
			payment_provider_charge: 505,
		});
		const { db } = getTestDatabase();
		switch (mutation) {
			case 'unavailable item':
				await db.update(items).set({ status: itemStatus.SOLD }).where(eq(items.id, item.id));
				break;
			case 'unpublished item':
				await db.update(items).set({ published: false }).where(eq(items.id, item.id));
				break;
			case 'deleted item':
				await db.update(items).set({ deleted_at: new Date() }).where(eq(items.id, item.id));
				break;
			case 'non-Easy-Pay item':
				await db.update(items).set({ easy_pay: false }).where(eq(items.id, item.id));
				break;
			case 'unpublished taxonomy':
				await db
					.update(categories)
					.set({ published: false })
					.where(eq(categories.id, actors.catalog.publishedCategory.id));
				break;
			case 'inactive seller address':
				await db.update(addresses).set({ status: 'inactive' }).where(eq(addresses.id, actors.seller.address.id));
				break;
			case 'inactive buyer address':
				await db.update(addresses).set({ status: 'inactive' }).where(eq(addresses.id, actors.buyer.address.id));
				break;
			case 'missing seller provider':
				await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));
				break;
			case 'missing buyer provider':
				await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.buyer.profile.id));
				break;
		}

		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(expectedStatus);
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toEqual([]);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toEqual([]);
	});

	it('accepts once, creating one provider transaction, complete order graph, and accepted system message', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const roomId = await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
			payment_provider_charge: 505,
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
		expect(body).not.toHaveProperty('payment_url');

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
			shipping_quote_id: proposal.shipping_quote_id,
			order_proposal_id: proposal.id,
			item_price: 10_000,
			payment_creation_state: 'created',
		});
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toHaveLength(1);
		const [systemMessage] = await db
			.select()
			.from(chat_messages)
			.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system')));
		expect(systemMessage?.metadata).toEqual({ order_id: body.order.id, type: 'proposal_accepted' });
		const acceptedEmail = await waitForEmail(actors.buyer.user.email, 'Tantovale - Proposal accepted');
		expect(acceptedEmail.HTML).toContain(`/auth/profile/orders?highlight=${body.order.id}`);
		expect(acceptedEmail.HTML).toContain(`/online/transactions/${body.transaction.id}/guest_pay`);
		expect(await proposalAcceptedMailCount(actors.buyer.user.email)).toBe(1);
		expect(
			await db.select().from(payment_invitation_outbox).where(eq(payment_invitation_outbox.order_id, body.order.id)),
		).toMatchObject([{ state: PAYMENT_INVITATION_STATES.SENT, attempt_count: 1 }]);

		await new TransactionSyncService().syncTransactionStatuses();
		expect(await proposalAcceptedMailCount(actors.buyer.user.email)).toBe(1);

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
				price: 10_090,
				postage_fee: 750,
				charge: 505,
			},
		});
		expect((transactionRequests[0]?.body as { description?: string }).description).toContain(order?.payment_attempt_id);
	});

	it('keeps proposal acceptance committed when the order-specific post-commit dispatcher fails', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item);
		const dispatch = vi
			.spyOn(PaymentInvitationOutboxService.prototype, 'dispatchOrder')
			.mockRejectedValueOnce(new Error('forced claim failure'));

		const response = await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
		expect(response.status).toBe(200);
		const body = (await response.json()) as { order: { id: number } };
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith(body.order.id);
		dispatch.mockRestore();

		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, body.order.id));
		const [intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, body.order.id));
		expect(storedOrder?.payment_creation_state).toBe(PAYMENT_CREATION_STATES.CREATED);
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.PENDING, attempt_count: 0 });

		await new PaymentInvitationOutboxService().dispatchPending();
		expect(await proposalAcceptedMailCount(actors.buyer.user.email)).toBe(1);
	});

	it.each([
		['16 minutes', 16 * 60 * 1_000],
		['24 hours', 24 * 60 * 60 * 1_000],
		['just before 96 hours', 96 * 60 * 60 * 1_000 - 5 * 60 * 1_000],
	] as const)('accepts an unchanged proposal %s after creation', async (_label, ageMs) => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item);
		const createdAt = new Date(Date.now() - ageMs);
		const { db } = getTestDatabase();
		await db.update(orders_proposals).set({ created_at: createdAt }).where(eq(orders_proposals.id, proposal.id));
		await db
			.update(shipping_quotes)
			.set({ expires_at: new Date(createdAt.getTime() + 96 * 60 * 60 * 1_000) })
			.where(eq(shipping_quotes.id, proposal.shipping_quote_id!));

		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(200);
	});

	it('rejects proposal acceptance after the immutable 96-hour quote evidence expires', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item);
		const createdAt = new Date(Date.now() - (96 * 60 * 60 * 1_000 + 60_000));
		const { db } = getTestDatabase();
		await db.update(orders_proposals).set({ created_at: createdAt }).where(eq(orders_proposals.id, proposal.id));
		await db
			.update(shipping_quotes)
			.set({ expires_at: new Date(createdAt.getTime() + 96 * 60 * 60 * 1_000) })
			.where(eq(shipping_quotes.id, proposal.shipping_quote_id!));

		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(400);
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toEqual([]);
	});

	it('keeps a reconciliation reservation after an ambiguous Trustap transaction failure', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
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
		const [reservation] = await db.select().from(orders).where(eq(orders.item_id, item.id));
		expect(reservation).toMatchObject({
			order_proposal_id: proposal.id,
			payment_transaction_id: null,
			payment_creation_state: 'reconciliation_required',
			status: ORDER_PHASES.PAYMENT_PENDING,
		});
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toEqual([]);
		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(400);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(1);
	});

	it('cleans a deterministic Trustap rejection and permits one safe acceptance retry', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
			payment_provider_charge: 505,
		});
		await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), 'transaction-client-error');

		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(500);
		const { db } = getTestDatabase();
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toEqual([]);
		const [pending] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(pending?.status).toBe(ORDER_PROPOSAL_PHASES.pending);

		await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), 'success');
		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(200);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(2);
	});

	it('does not hold the item commerce lock while retrieving the accepted proposal quote', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
			payment_provider_charge: 505,
		});
		await setProviderScenario(providerUrl('SHIPPING_PROVIDER_API_URL'), 'shippo-delay');

		const responsePromise = updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
		await waitForProviderRequest(
			providerUrl('SHIPPING_PROVIDER_API_URL'),
			'GET',
			`/shipments/${proposal.shipping_label_id}`,
		);

		const { client } = getTestDatabase();
		const contender = await client.connect();
		try {
			await contender.query('BEGIN');
			const result = await contender.query<{ acquired: boolean }>(
				'SELECT pg_try_advisory_xact_lock(hashtext(current_database() || $1), $2) AS acquired',
				[itemCommerceLockScope, item.id],
			);
			expect(result.rows[0]?.acquired).toBe(true);
		} finally {
			await contender.query('ROLLBACK');
			contender.release();
		}
		expect((await responsePromise).status).toBe(500);
	});

	it('serializes proposal acceptance against buy-now into one order and one provider transaction', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
			payment_provider_charge: 505,
		});

		const { client } = getTestDatabase();
		const blocker = await client.connect();
		let responsesPromise: Promise<[Response, Response]> | undefined;
		try {
			await blocker.query('BEGIN');
			const processResult = await blocker.query<{ process_id: number }>('SELECT pg_backend_pid() AS process_id');
			await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
				itemCommerceLockScope,
				item.id,
			]);
			responsesPromise = Promise.all([
				updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted'),
				authenticatedRequest('/item/auth/buy_now', 'POST', actors.buyer.jar, { item_id: item.id }),
			]);
			await waitForBlockedRequests(processResult.rows[0]!.process_id, 2);
			await blocker.query('COMMIT');
		} finally {
			if (!responsesPromise) await blocker.query('ROLLBACK');
			blocker.release();
		}
		if (!responsesPromise) throw new Error('Accept-vs-buy requests were not started');
		const [acceptResponse, buyNowResponse] = await responsesPromise;
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

	it('serializes proposal acceptance against cron expiry under the exact item lock', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000),
			proposal_price: 10_000,
			platform_charge: 90,
			payment_provider_charge: 505,
		});
		const { client, db } = getTestDatabase();
		const [eligible] = await db
			.select({ id: orders_proposals.id })
			.from(orders_proposals)
			.where(
				and(
					eq(orders_proposals.id, proposal.id),
					eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
					lt(
						orders_proposals.created_at,
						new Date(Date.now() - environment.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS * 60 * 60 * 1_000),
					),
				),
			);
		expect(eligible).toEqual({ id: proposal.id });
		const blocker = await client.connect();
		let requests: Promise<[Response, Response]> | undefined;
		try {
			await blocker.query('BEGIN');
			const processResult = await blocker.query<{ process_id: number }>('SELECT pg_backend_pid() AS process_id');
			const blockingProcessId = Number(processResult.rows[0]!.process_id);
			await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
				itemCommerceLockScope,
				item.id,
			]);
			const cronRequest = app.request('/cron/auth/expired-proposals-check?key=proposals-cron-test-key');
			await waitForBlockedRequests(blockingProcessId, 1);
			const acceptRequest = updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
			requests = Promise.all([acceptRequest, cronRequest]);
			await waitForBlockedRequests(blockingProcessId, 2);
			await blocker.query('COMMIT');
		} finally {
			if (!requests) await blocker.query('ROLLBACK');
			blocker.release();
		}
		if (!requests) throw new Error('Proposal accept/expiry requests were not started');
		const [acceptResponse, cronResponse] = await requests;
		expect(cronResponse.status).toBe(200);

		const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		const storedOrders = await db.select().from(orders).where(eq(orders.item_id, item.id));
		const proposalMessages = await rowsForProposal(proposal.id);
		const acceptedMessages = proposalMessages.filter(
			(message) =>
				message.message_type === 'system' &&
				message.metadata !== null &&
				typeof message.metadata === 'object' &&
				'type' in message.metadata &&
				message.metadata.type === 'proposal_accepted',
		);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		if (storedProposal?.status === ORDER_PROPOSAL_PHASES.accepted) {
			expect(acceptResponse.status).toBe(200);
			expect(storedOrders).toHaveLength(1);
			expect(storedOrders[0]?.order_proposal_id).toBe(proposal.id);
			expect(acceptedMessages).toHaveLength(1);
			expect(transactionRequests).toHaveLength(1);
		} else {
			expect(storedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.expired);
			expect([400, 404, 409]).toContain(acceptResponse.status);
			expect(storedOrders).toHaveLength(0);
			expect(acceptedMessages).toHaveLength(0);
			expect(transactionRequests).toHaveLength(0);
		}
	});

	it.each(['edit', 'unpublish', 'delete'] as const)(
		'serializes proposal acceptance against %s so exactly one operation wins',
		async (mutation) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			await createRoom(actors, item.id);
			const proposal = await createQuotedProposalFixture(actors, item, {
				proposal_price: 10_000,
				platform_charge: 90,
			});
			const { client, db } = getTestDatabase();
			const blocker = await client.connect();
			let released = false;
			try {
				await blocker.query('BEGIN');
				const processResult = await blocker.query<{ process_id: number }>('SELECT pg_backend_pid() AS process_id');
				await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
					itemCommerceLockScope,
					item.id,
				]);
				const acceptPromise = updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
				const mutationPromise =
					mutation === 'edit'
						? authenticatedRequest(`/item/auth/edit/${item.id}`, 'PUT', actors.seller.jar, {
								commons: { title: 'Serialized proposal edit' },
							})
						: authenticatedRequest(
								mutation === 'delete' ? '/item/auth/user_delete_item' : '/item/auth/publish_state',
								'POST',
								actors.seller.jar,
								mutation === 'delete' ? { id: item.id } : { id: item.id, published: false },
							);
				await waitForBlockedRequests(processResult.rows[0]!.process_id, 2);
				await blocker.query('COMMIT');
				released = true;
				const [acceptResponse, mutationResponse] = await Promise.all([acceptPromise, mutationPromise]);
				expect([acceptResponse.status, mutationResponse.status].filter((status) => status === 200)).toHaveLength(1);
				const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
				if (acceptResponse.status === 200) {
					expect(mutationResponse.status).toBe(400);
					expect(storedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.accepted);
				} else {
					expect([400, 404, 409]).toContain(acceptResponse.status);
					expect(mutationResponse.status).toBe(200);
					expect(storedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
				}
			} finally {
				if (!released) await blocker.query('ROLLBACK');
				blocker.release();
			}
		},
	);

	it('keeps an accepted-proposal reservation and blocks retry if final local persistence fails', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const conflictingItem = await createItemFixture(actors, {
			commons: { title: 'Proposal transaction conflict item' },
		});
		const roomId = await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
		});
		const expectedTransactionId = String(trustapTransactionFixture.id + 1);
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
			payment_transaction_id: expectedTransactionId,
			payment_creation_state: 'reconciliation_required',
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

		await db
			.delete(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, expectedTransactionId));
		const syncResult = await new TransactionSyncService().syncTransactionStatuses();
		expect(syncResult.results).toContainEqual(
			expect.objectContaining({
				orderId: reservations[0]!.id,
				transactionId: expectedTransactionId,
				recovered: true,
				success: true,
			}),
		);
		const [recoveredProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(recoveredProposal?.status).toBe(ORDER_PROPOSAL_PHASES.accepted);
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toEqual([expect.objectContaining({ transactionId: expectedTransactionId, status: 'created' })]);
		const recoveredMessages = await db
			.select()
			.from(chat_messages)
			.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system')));
		expect(recoveredMessages).toEqual([
			expect.objectContaining({ metadata: { order_id: reservations[0]!.id, type: 'proposal_accepted' } }),
		]);
		const recoveredMail = await waitForEmail(actors.buyer.user.email, 'Tantovale - Proposal accepted');
		expect(recoveredMail.HTML).toContain(`/auth/profile/orders?highlight=${reservations[0]!.id}`);
		expect(recoveredMail.HTML).toContain(`/online/transactions/${expectedTransactionId}/guest_pay`);
		await new TransactionSyncService().syncTransactionStatuses();
		expect(await proposalAcceptedMailCount(actors.buyer.user.email)).toBe(1);

		const retry = await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted');
		expect(retry.status).toBe(404);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(1);
	});

	it('quarantines a same-item provider row whose durable identity and amounts do not match recovery', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const conflictingItem = await createItemFixture(actors, { commons: { title: 'Corrupt provider evidence' } });
		await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
		});
		const transactionId = String(trustapTransactionFixture.id + 1);
		const { db } = getTestDatabase();
		const [conflictingProviderRow] = await db
			.insert(entityTrustapTransactions)
			.values({
				entityId: conflictingItem.id,
				sellerId: 'wrong-seller',
				buyerId: 'wrong-buyer',
				transactionId,
				status: 'created',
				price: 1,
				charge: 0,
				chargeSeller: 0,
				entityTitle: conflictingItem.title,
			})
			.returning();

		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(500);
		const [reservation] = await db.select().from(orders).where(eq(orders.item_id, item.id));
		await db
			.update(entityTrustapTransactions)
			.set({ entityId: item.id })
			.where(eq(entityTrustapTransactions.id, conflictingProviderRow!.id));

		const sync = await new TransactionSyncService().syncTransactionStatuses();

		expect(sync.results).toContainEqual(
			expect.objectContaining({
				orderId: reservation!.id,
				transactionId,
				requiresManualReconciliation: true,
				success: false,
				error: 'Existing provider evidence conflicts with the durable local and remote snapshots',
			}),
		);
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.id, conflictingProviderRow!.id));
		const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(storedProvider?.quarantined).toBe(true);
		expect(storedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
		expect(
			await db.select().from(payment_invitation_outbox).where(eq(payment_invitation_outbox.order_id, reservation!.id)),
		).toEqual([]);
		expect(
			await db
				.select()
				.from(commerce_reconciliation_audit)
				.where(
					and(
						eq(commerce_reconciliation_audit.source_table, 'entity_trustap_transactions'),
						eq(commerce_reconciliation_audit.source_row_id, conflictingProviderRow!.id),
					),
				),
		).toEqual([
			expect.objectContaining({
				conflict_type: 'runtime_transaction_correlation_mismatch',
				source_table: 'entity_trustap_transactions',
			}),
		]);
	});

	it('finalizes a recovered proposal as rejected without inviting payment when Trustap is terminal', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const conflictingItem = await createItemFixture(actors, {
			commons: { title: 'Terminal recovered proposal conflict item' },
		});
		const roomId = await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item, {
			proposal_price: 10_000,
			platform_charge: 90,
		});
		const expectedTransactionId = String(trustapTransactionFixture.id + 1);
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

		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(500);
		const [reservation] = await db.select().from(orders).where(eq(orders.item_id, item.id));
		expect(reservation?.payment_creation_state).toBe('reconciliation_required');
		await db
			.delete(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, expectedTransactionId));
		await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), expectedTransactionId, 'rejected');

		await new TransactionSyncService().syncTransactionStatuses();

		const [recoveredProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		const [recoveredOrder] = await db.select().from(orders).where(eq(orders.id, reservation!.id));
		expect(recoveredProposal?.status).toBe(ORDER_PROPOSAL_PHASES.rejected);
		expect(recoveredOrder).toMatchObject({
			payment_creation_state: 'created',
			status: ORDER_PHASES.PAYMENT_FAILED,
		});
		expect(
			await db
				.select()
				.from(chat_messages)
				.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system'))),
		).toEqual([expect.objectContaining({ metadata: { order_id: reservation!.id, type: 'proposal_rejected' } })]);
		expect(await proposalAcceptedMailCount(actors.buyer.user.email)).toBe(0);
	});

	it('recovers a correlated existing transaction when the provider repeats the same status', async () => {
		const { proposal, reservation, transactionId } =
			await createExistingCreatedRecoveryReservation('Same status recovery item');
		const { db } = getTestDatabase();

		const sync = await new TransactionSyncService().syncTransactionStatuses();

		expect(sync.results).toContainEqual({
			transactionId,
			orderId: reservation.id,
			recovered: true,
			success: true,
		});
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, reservation.id));
		const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
		});
		expect(storedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.accepted);
	});

	it('re-reads a known-ID recovery reservation after provider I/O and never reopens a terminal order', async () => {
		const { proposal, reservation, transactionId } =
			await createExistingCreatedRecoveryReservation('Terminal recovery race item');
		const { db } = getTestDatabase();
		const originalGetTransactionStatus = PaymentProviderService.prototype.getTransactionStatus;
		const remote = await originalGetTransactionStatus.call(new PaymentProviderService(), transactionId);
		if (!remote) throw new Error('Missing remote transaction for terminal recovery race');
		let signalProviderRead!: () => void;
		let releaseProviderRead!: () => void;
		const providerRead = new Promise<void>((resolve) => {
			signalProviderRead = resolve;
		});
		const providerRelease = new Promise<void>((resolve) => {
			releaseProviderRead = resolve;
		});
		const getTransactionStatus = vi
			.spyOn(PaymentProviderService.prototype, 'getTransactionStatus')
			.mockImplementation(async () => {
				signalProviderRead();
				await providerRelease;
				return remote;
			});

		const syncPromise = new TransactionSyncService().syncTransactionStatuses();
		let sync: Awaited<typeof syncPromise> | undefined;
		try {
			await providerRead;
			await db.update(orders).set({ status: ORDER_PHASES.COMPLETED }).where(eq(orders.id, reservation.id));
			releaseProviderRead();
			sync = await syncPromise;
		} finally {
			releaseProviderRead();
			await syncPromise.catch(() => undefined);
			getTransactionStatus.mockRestore();
		}
		if (!sync) throw new Error('Transaction sync did not complete');

		expect(sync.results).toContainEqual(
			expect.objectContaining({
				transactionId,
				orderId: reservation.id,
				requiresManualReconciliation: true,
				success: false,
				error: 'A terminal order cannot be reopened automatically',
			}),
		);
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, reservation.id));
		const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.COMPLETED,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(storedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
	});

	it('does not let known-ID recovery cross the complained to rejected terminal branch', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors, { commons: { title: 'Illegal recovery lineage item' } });
		const conflictingItem = await createItemFixture(actors, {
			commons: { title: 'Illegal recovery lineage conflict' },
		});
		const roomId = await createRoom(actors, item.id);
		const proposal = await createQuotedProposalFixture(actors, item);
		const transactionId = String(trustapTransactionFixture.id + 1);
		const { db } = getTestDatabase();
		await db.insert(entityTrustapTransactions).values({
			entityId: conflictingItem.id,
			sellerId: actors.seller.profile.payment_provider_id,
			buyerId: actors.buyer.profile.payment_provider_id,
			transactionId,
			status: 'created',
			price: 1,
			charge: 0,
			chargeSeller: 0,
			entityTitle: conflictingItem.title,
		});
		expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(500);
		const [reservation] = await db.select().from(orders).where(eq(orders.item_id, item.id));
		if (!reservation) throw new Error('Missing illegal recovery reservation');
		await db.delete(entityTrustapTransactions).where(eq(entityTrustapTransactions.transactionId, transactionId));
		await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), transactionId, 'complained');
		await new TransactionSyncService().syncTransactionStatuses();
		const messagesBeforeIllegalEdge = await db
			.select({ id: chat_messages.id })
			.from(chat_messages)
			.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system')));
		await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), transactionId, 'rejected');

		const sync = await new TransactionSyncService().syncTransactionStatuses();

		expect(sync.results).toContainEqual(
			expect.objectContaining({
				transactionId,
				orderId: reservation.id,
				requiresManualReconciliation: true,
				success: false,
			}),
		);
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, reservation.id));
		const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		const messagesAfterIllegalEdge = await db
			.select({ id: chat_messages.id })
			.from(chat_messages)
			.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system')));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(storedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.accepted);
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.COMPLAINED);
		expect(messagesAfterIllegalEdge).toEqual(messagesBeforeIllegalEdge);
	});

	it('recovers every known Trustap state without a false proposal or payment invitation', async () => {
		const cases = [
			['created', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.PAYMENT_PENDING, true, false],
			['joined', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.PAYMENT_PENDING, true, false],
			['paid', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.PAYMENT_CONFIRMED, false, false],
			['tracked', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.SHIPPING_CONFIRMED, false, false],
			['delivered', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.COMPLETED, false, false],
			['complained', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.PAYMENT_PENDING, false, true],
			['complaint_period_ended', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.COMPLETED, false, false],
			['funds_released', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.COMPLETED, false, false],
			['rejected', ORDER_PROPOSAL_PHASES.rejected, ORDER_PHASES.PAYMENT_FAILED, false, false],
			['cancelled', ORDER_PROPOSAL_PHASES.rejected, ORDER_PHASES.CANCELLED, false, false],
			['cancelled_with_payment', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.PAYMENT_REFUNDED, false, false],
			['payment_refunded', ORDER_PROPOSAL_PHASES.accepted, ORDER_PHASES.PAYMENT_REFUNDED, false, false],
		] as const;

		for (const [
			index,
			[remoteStatus, proposalStatus, orderStatus, shouldInvite, remainsReconciliation],
		] of cases.entries()) {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors, { commons: { title: `Recovery matrix ${index}` } });
			const conflictingItem = await createItemFixture(actors, {
				commons: { title: `Recovery matrix conflict ${index}` },
			});
			const roomId = await createRoom(actors, item.id);
			const proposal = await createQuotedProposalFixture(actors, item, {
				proposal_price: 10_000,
				platform_charge: 90,
			});
			const transactionId = String(trustapTransactionFixture.id + index + 1);
			const { db } = getTestDatabase();
			await db.insert(entityTrustapTransactions).values({
				entityId: conflictingItem.id,
				sellerId: actors.seller.profile.payment_provider_id,
				buyerId: actors.buyer.profile.payment_provider_id,
				transactionId,
				status: 'created',
				price: 1,
				charge: 0,
				chargeSeller: 0,
				entityTitle: conflictingItem.title,
			});

			expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(500);
			const [reservation] = await db.select().from(orders).where(eq(orders.item_id, item.id));
			expect(reservation?.payment_creation_state).toBe(PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED);
			await db.delete(entityTrustapTransactions).where(eq(entityTrustapTransactions.transactionId, transactionId));
			await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), transactionId, remoteStatus);

			await new TransactionSyncService().syncTransactionStatuses();

			const [storedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
			const [storedOrder] = await db.select().from(orders).where(eq(orders.id, reservation!.id));
			const [storedProvider] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId));
			const invitations = await db
				.select()
				.from(payment_invitation_outbox)
				.where(eq(payment_invitation_outbox.order_id, reservation!.id));
			const [systemMessage] = await db
				.select()
				.from(chat_messages)
				.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.message_type, 'system')));

			expect(storedProposal?.status, remoteStatus).toBe(proposalStatus);
			expect(storedOrder, remoteStatus).toMatchObject({
				status: orderStatus,
				payment_creation_state: remainsReconciliation
					? PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED
					: PAYMENT_CREATION_STATES.CREATED,
				payment_cancellation_state: ['rejected', 'cancelled', 'cancelled_with_payment', 'payment_refunded'].includes(
					remoteStatus,
				)
					? PAYMENT_CANCELLATION_STATES.CANCELLED
					: PAYMENT_CANCELLATION_STATES.NONE,
			});
			expect(storedProvider?.status, remoteStatus).toBe(remoteStatus);
			expect(invitations, remoteStatus).toHaveLength(shouldInvite ? 1 : 0);
			if (shouldInvite) expect(invitations[0]?.state).toBe(PAYMENT_INVITATION_STATES.SENT);
			expect(await proposalAcceptedMailCount(actors.buyer.user.email), remoteStatus).toBe(shouldInvite ? 1 : 0);
			expect(systemMessage?.metadata, remoteStatus).toEqual({
				order_id: reservation!.id,
				type: proposalStatus === ORDER_PROPOSAL_PHASES.accepted ? 'proposal_accepted' : 'proposal_rejected',
			});
			if (remoteStatus === 'complained') expect(systemMessage?.message).toMatch(/complaint review/i);
			if (remoteStatus === 'cancelled_with_payment' || remoteStatus === 'payment_refunded') {
				expect(systemMessage?.message).toMatch(/refunded/i);
			}
		}
	});

	it.each([
		['payment_refunded', ORDER_PHASES.PAYMENT_REFUNDED, PAYMENT_CANCELLATION_STATES.CANCELLED],
		['funds_released', ORDER_PHASES.COMPLETED, PAYMENT_CANCELLATION_STATES.NONE],
		['cancelled', ORDER_PHASES.CANCELLED, PAYMENT_CANCELLATION_STATES.CANCELLED],
	] as const)(
		'closes complained known-ID recovery with authoritative %s',
		async (terminalStatus, orderStatus, cancellationState) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const conflictingItem = await createItemFixture(actors, {
				commons: { title: `Recovery ${terminalStatus.replaceAll('_', ' ')} conflict` },
			});
			await createRoom(actors, item.id);
			const proposal = await createQuotedProposalFixture(actors, item);
			const transactionId = String(trustapTransactionFixture.id + 1);
			const { db } = getTestDatabase();
			await db.insert(entityTrustapTransactions).values({
				entityId: conflictingItem.id,
				sellerId: actors.seller.profile.payment_provider_id,
				buyerId: actors.buyer.profile.payment_provider_id,
				transactionId,
				status: 'created',
				price: 1,
				charge: 0,
				chargeSeller: 0,
				entityTitle: conflictingItem.title,
			});
			expect((await updateProposal(actors.seller.jar, proposal.id, item.id, 'accepted')).status).toBe(500);
			const [reservation] = await db.select().from(orders).where(eq(orders.item_id, item.id));
			await db.delete(entityTrustapTransactions).where(eq(entityTrustapTransactions.transactionId, transactionId));
			await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), transactionId, 'complained');
			await new TransactionSyncService().syncTransactionStatuses();

			const [complainedOrder] = await db.select().from(orders).where(eq(orders.id, reservation!.id));
			expect(complainedOrder).toMatchObject({
				status: ORDER_PHASES.PAYMENT_PENDING,
				payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
			});
			await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), transactionId, terminalStatus);
			await new TransactionSyncService().syncTransactionStatuses();

			const [resolvedOrder] = await db.select().from(orders).where(eq(orders.id, reservation!.id));
			const [resolvedProposal] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, proposal.id));
			expect(resolvedOrder).toMatchObject({
				status: orderStatus,
				payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
				payment_cancellation_state: cancellationState,
			});
			expect(resolvedProposal?.status).toBe(ORDER_PROPOSAL_PHASES.accepted);
			expect(await proposalAcceptedMailCount(actors.buyer.user.email)).toBe(0);
		},
	);

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
