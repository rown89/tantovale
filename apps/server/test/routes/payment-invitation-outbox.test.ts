import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
	ORDER_PHASES,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
	PAYMENT_INVITATION_STATES,
	entityTrustapTransactionTypeValues,
} from '../../src/database/schemas/enumerated_values';
import { entityTrustapTransactions, orders, payment_invitation_outbox } from '../../src/database/schemas/schema';
import { PaymentInvitationOutboxService } from '../../src/routes/payments/payment-invitation-outbox.service';
import {
	createCommerceActors,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
} from '../fixtures/commerce';
import { getTestDatabase } from '../helpers/database';

/* eslint-disable turbo/no-undeclared-env-vars -- The disposable test harness supplies and temporarily overrides worker-local SMTP values. */

async function acceptedMailCount(recipient: string): Promise<number> {
	const origin = process.env.MAILPIT_API_URL;
	if (!origin) throw new Error('Missing worker-local Mailpit URL');
	const url = new URL('/api/v1/search', origin);
	url.searchParams.set('query', `to:${recipient}`);
	const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
	if (!response.ok) throw new Error(`Mailpit search failed with ${response.status}`);
	const body = (await response.json()) as { messages: Array<{ Subject: string }> };
	return body.messages.filter(({ Subject }) => Subject === 'Tantovale - Proposal accepted').length;
}

async function createPendingInvitation(transactionId = '91001') {
	const actors = await createCommerceActors();
	const item = await createItemFixture(actors);
	const proposal = await createProposalFixture(actors, item, { status: ORDER_PROPOSAL_PHASES.accepted });
	const order = await createOrderFixture(actors, item, {
		order_proposal_id: proposal.id,
		payment_transaction_id: transactionId,
		payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
		status: ORDER_PHASES.PAYMENT_PENDING,
	});
	const { db } = getTestDatabase();
	await db.insert(entityTrustapTransactions).values({
		entityId: item.id,
		sellerId: actors.seller.profile.payment_provider_id,
		buyerId: actors.buyer.profile.payment_provider_id,
		transactionId,
		status: entityTrustapTransactionTypeValues.CREATED,
		price: order.item_price + order.platform_charge,
		charge: order.payment_provider_charge,
		chargeSeller: 0,
		entityTitle: item.title,
	});
	await db.insert(payment_invitation_outbox).values({
		order_id: order.id,
		transaction_id: transactionId,
		recipient_email: actors.buyer.user.email,
		merchant_username: actors.seller.user.username,
		item_name: item.title,
		state: PAYMENT_INVITATION_STATES.PENDING,
	});
	return { actors, order };
}

describe('durable proposal payment invitation outbox', () => {
	it('dispatches one requested order without draining unrelated backlog', async () => {
		const first = await createPendingInvitation('91001');
		const second = await createPendingInvitation('91002');

		await new PaymentInvitationOutboxService().dispatchOrder(first.order.id);

		const { db } = getTestDatabase();
		const intents = await db.select().from(payment_invitation_outbox);
		expect(intents.find(({ order_id }) => order_id === first.order.id)).toMatchObject({
			state: PAYMENT_INVITATION_STATES.SENT,
			attempt_count: 1,
		});
		expect(intents.find(({ order_id }) => order_id === second.order.id)).toMatchObject({
			state: PAYMENT_INVITATION_STATES.PENDING,
			attempt_count: 0,
		});
		expect(await acceptedMailCount(first.actors.buyer.user.email)).toBe(1);
		expect(await acceptedMailCount(second.actors.buyer.user.email)).toBe(0);
	});

	it('allows only one concurrent dispatcher to lease and send an invitation', async () => {
		const { actors, order } = await createPendingInvitation();
		await Promise.all([
			new PaymentInvitationOutboxService().dispatchPending(),
			new PaymentInvitationOutboxService().dispatchPending(),
		]);

		const { db } = getTestDatabase();
		const [intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, order.id));
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.SENT, attempt_count: 1 });
		expect(intent?.last_attempt_at).toBeInstanceOf(Date);
		expect(intent?.sent_at).toBeInstanceOf(Date);
		expect(intent?.lease_expires_at).toBeNull();
		expect(await acceptedMailCount(actors.buyer.user.email)).toBe(1);
	});

	it('reclaims an expired sending lease after a simulated worker crash', async () => {
		const { actors, order } = await createPendingInvitation();
		const { db } = getTestDatabase();
		await db
			.update(payment_invitation_outbox)
			.set({
				state: PAYMENT_INVITATION_STATES.SENDING,
				attempt_count: 1,
				lease_token: '00000000-0000-4000-8000-000000000001',
				last_attempt_at: new Date(Date.now() - 60_000),
				lease_expires_at: new Date(Date.now() - 30_000),
			})
			.where(eq(payment_invitation_outbox.order_id, order.id));

		await new PaymentInvitationOutboxService().dispatchPending();

		const [intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, order.id));
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.SENT, attempt_count: 2 });
		expect(await acceptedMailCount(actors.buyer.user.email)).toBe(1);
	});

	it('returns a failed SMTP attempt to pending and succeeds on a later dispatch within the configured timeout', async () => {
		const { actors, order } = await createPendingInvitation();
		const originalHost = process.env.SMTP_HOST;
		const originalPort = process.env.SMTP_PORT;
		const startedAt = Date.now();
		try {
			process.env.SMTP_HOST = '127.0.0.1';
			process.env.SMTP_PORT = '1';
			await new PaymentInvitationOutboxService().dispatchPending();
		} finally {
			process.env.SMTP_HOST = originalHost;
			process.env.SMTP_PORT = originalPort;
		}
		expect(Date.now() - startedAt).toBeLessThan(1_000);

		const { db } = getTestDatabase();
		let [intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, order.id));
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.PENDING, attempt_count: 1 });
		expect(intent?.lease_expires_at).toBeNull();
		expect(await acceptedMailCount(actors.buyer.user.email)).toBe(0);

		await new PaymentInvitationOutboxService().dispatchPending();
		[intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, order.id));
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.SENT, attempt_count: 2 });
		expect(await acceptedMailCount(actors.buyer.user.email)).toBe(1);
	});

	it('does not claim an invitation after its order is no longer buyer-payable', async () => {
		const { actors, order } = await createPendingInvitation();
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.PAYMENT_CONFIRMED }).where(eq(orders.id, order.id));

		await new PaymentInvitationOutboxService().dispatchPending();

		const [intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, order.id));
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.PENDING, attempt_count: 0 });
		expect(await acceptedMailCount(actors.buyer.user.email)).toBe(0);
	});

	it.each([
		PAYMENT_CANCELLATION_STATES.CANCELLING,
		PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		PAYMENT_CANCELLATION_STATES.CANCELLED,
	])('does not claim an invitation once cancellation state becomes %s', async (paymentCancellationState) => {
		const { actors, order } = await createPendingInvitation();
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({ payment_cancellation_state: paymentCancellationState })
			.where(eq(orders.id, order.id));

		await new PaymentInvitationOutboxService().dispatchPending();

		const [intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, order.id));
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.PENDING, attempt_count: 0 });
		expect(await acceptedMailCount(actors.buyer.user.email)).toBe(0);
	});

	it.each([entityTrustapTransactionTypeValues.PAID, entityTrustapTransactionTypeValues.COMPLAINED])(
		'does not claim an invitation when the provider transaction is already %s',
		async (providerStatus) => {
			const { actors, order } = await createPendingInvitation();
			const { db } = getTestDatabase();
			await db
				.update(entityTrustapTransactions)
				.set({ status: providerStatus })
				.where(eq(entityTrustapTransactions.transactionId, order.payment_transaction_id!));

			await new PaymentInvitationOutboxService().dispatchPending();

			const [intent] = await db
				.select()
				.from(payment_invitation_outbox)
				.where(eq(payment_invitation_outbox.order_id, order.id));
			expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.PENDING, attempt_count: 0 });
			expect(await acceptedMailCount(actors.buyer.user.email)).toBe(0);
		},
	);

	it('does not retry a pending SMTP failure after cancellation enters reconciliation', async () => {
		const { actors, order } = await createPendingInvitation();
		const originalHost = process.env.SMTP_HOST;
		const originalPort = process.env.SMTP_PORT;
		try {
			process.env.SMTP_HOST = '127.0.0.1';
			process.env.SMTP_PORT = '1';
			await new PaymentInvitationOutboxService().dispatchOrder(order.id);
		} finally {
			process.env.SMTP_HOST = originalHost;
			process.env.SMTP_PORT = originalPort;
		}
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({ payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED })
			.where(eq(orders.id, order.id));

		await new PaymentInvitationOutboxService().dispatchPending();

		const [intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, order.id));
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.PENDING, attempt_count: 1 });
		expect(await acceptedMailCount(actors.buyer.user.email)).toBe(0);
	});
});
