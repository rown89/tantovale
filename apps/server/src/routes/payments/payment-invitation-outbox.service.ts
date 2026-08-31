import { randomUUID } from 'node:crypto';
import { and, eq, lte, notInArray, or, sql } from 'drizzle-orm';

import { createClient } from '#database/index';
import {
	ORDER_PHASES,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CREATION_STATES,
	PAYMENT_INVITATION_STATES,
} from '#database/schemas/enumerated_values';
import { orders, orders_proposals, payment_invitation_outbox } from '#db-schema';
import { sendProposalAcceptedMessage } from '#mailer/templates/proposals/buyer/proposal-accepted';
import { buildGuestPaymentUrl } from './payment-provider.service';

export const paymentInvitationLeaseMs = 30_000;

type ClaimedInvitation = {
	id: number;
	orderId: number;
	transactionId: string;
	recipientEmail: string;
	merchantUsername: string;
	itemName: string;
	leaseToken: string;
};

export class PaymentInvitationOutboxService {
	private readonly db = createClient().db;

	private async claimOne(excludedIds: number[]): Promise<ClaimedInvitation | undefined> {
		return this.db.transaction(async (tx) => {
			const now = new Date();
			const available = or(
				eq(payment_invitation_outbox.state, PAYMENT_INVITATION_STATES.PENDING),
				and(
					eq(payment_invitation_outbox.state, PAYMENT_INVITATION_STATES.SENDING),
					lte(payment_invitation_outbox.lease_expires_at, now),
				),
			);
			if (!available) throw new Error('Payment invitation availability predicate is empty');
			const predicates = [
				available,
				eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
				eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
				eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.accepted),
				eq(orders.payment_transaction_id, payment_invitation_outbox.transaction_id),
			];
			if (excludedIds.length > 0) predicates.push(notInArray(payment_invitation_outbox.id, excludedIds));
			const [candidate] = await tx
				.select({
					id: payment_invitation_outbox.id,
					orderId: payment_invitation_outbox.order_id,
					transactionId: payment_invitation_outbox.transaction_id,
					recipientEmail: payment_invitation_outbox.recipient_email,
					merchantUsername: payment_invitation_outbox.merchant_username,
					itemName: payment_invitation_outbox.item_name,
				})
				.from(payment_invitation_outbox)
				.innerJoin(orders, eq(payment_invitation_outbox.order_id, orders.id))
				.innerJoin(orders_proposals, eq(orders.order_proposal_id, orders_proposals.id))
				.where(and(...predicates))
				.for('update', { skipLocked: true })
				.limit(1);
			if (!candidate) return undefined;

			const leaseToken = randomUUID();
			const [claimed] = await tx
				.update(payment_invitation_outbox)
				.set({
					state: PAYMENT_INVITATION_STATES.SENDING,
					attempt_count: sql`${payment_invitation_outbox.attempt_count} + 1`,
					lease_token: leaseToken,
					lease_expires_at: new Date(now.getTime() + paymentInvitationLeaseMs),
					last_attempt_at: now,
					updated_at: now,
				})
				.where(eq(payment_invitation_outbox.id, candidate.id))
				.returning({ id: payment_invitation_outbox.id });
			if (!claimed) return undefined;
			return { ...candidate, leaseToken };
		});
	}

	async dispatchPending(): Promise<void> {
		const attemptedIds: number[] = [];
		for (;;) {
			const claimed = await this.claimOne(attemptedIds);
			if (!claimed) return;
			attemptedIds.push(claimed.id);
			try {
				await sendProposalAcceptedMessage({
					to: claimed.recipientEmail,
					merchant_username: claimed.merchantUsername,
					itemName: claimed.itemName,
					orderId: claimed.orderId,
					paymentUrl: buildGuestPaymentUrl(claimed.transactionId, claimed.orderId),
				});
				const now = new Date();
				await this.db
					.update(payment_invitation_outbox)
					.set({
						state: PAYMENT_INVITATION_STATES.SENT,
						lease_token: null,
						lease_expires_at: null,
						sent_at: now,
						updated_at: now,
					})
					.where(
						and(
							eq(payment_invitation_outbox.id, claimed.id),
							eq(payment_invitation_outbox.state, PAYMENT_INVITATION_STATES.SENDING),
							eq(payment_invitation_outbox.lease_token, claimed.leaseToken),
						),
					);
			} catch (error) {
				console.error('Failed to send proposal payment invitation:', error);
				await this.db
					.update(payment_invitation_outbox)
					.set({
						state: PAYMENT_INVITATION_STATES.PENDING,
						lease_token: null,
						lease_expires_at: null,
						updated_at: new Date(),
					})
					.where(
						and(
							eq(payment_invitation_outbox.id, claimed.id),
							eq(payment_invitation_outbox.state, PAYMENT_INVITATION_STATES.SENDING),
							eq(payment_invitation_outbox.lease_token, claimed.leaseToken),
						),
					);
			}
		}
	}
}
