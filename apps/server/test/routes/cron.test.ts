import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
	ORDER_PROPOSAL_PHASES,
	ORDER_PHASES,
	PAYMENT_CREATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import { orders, orders_proposals } from '../../src/database/schemas/schema';
import {
	createCommerceActors,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
} from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';

describe('commerce expiry cron routes', () => {
	it('expires only fully created payment-pending orders and preserves in-flight payment creation', async () => {
		const actors = await createCommerceActors();
		const old = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
		const created = await createOrderFixture(actors, await createItemFixture(actors), { created_at: old });
		const creating = await createOrderFixture(actors, await createItemFixture(actors), {
			created_at: old,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATING,
		});
		const reconciliation = await createOrderFixture(actors, await createItemFixture(actors), {
			created_at: old,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		});

		const response = await authenticatedRequest(
			'/cron/auth/expired-orders-check?key=orders-cron-test-key',
			'GET',
			actors.seller.jar,
		);
		expect(response.status).toBe(200);

		const { db } = getTestDatabase();
		const stored = await db.select().from(orders);
		expect(stored.find(({ id }) => id === created.id)?.status).toBe(ORDER_PHASES.EXPIRED);
		expect(stored.find(({ id }) => id === creating.id)?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(stored.find(({ id }) => id === reconciliation.id)?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
	});

	it('does not expire a pending proposal linked to an in-flight or reconciliation order', async () => {
		const actors = await createCommerceActors();
		const old = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
		const plainItem = await createItemFixture(actors);
		const protectedItem = await createItemFixture(actors);
		const plain = await createProposalFixture(actors, plainItem, { created_at: old });
		const protectedProposal = await createProposalFixture(actors, protectedItem, { created_at: old });
		await createOrderFixture(actors, protectedItem, {
			created_at: old,
			order_proposal_id: protectedProposal.id,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		});

		const response = await authenticatedRequest(
			'/cron/auth/expired-proposals-check?key=proposals-cron-test-key',
			'GET',
			actors.seller.jar,
		);
		expect(response.status).toBe(200);

		const { db } = getTestDatabase();
		const [storedPlain] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, plain.id));
		const [storedProtected] = await db
			.select()
			.from(orders_proposals)
			.where(eq(orders_proposals.id, protectedProposal.id));
		expect(storedPlain?.status).toBe(ORDER_PROPOSAL_PHASES.expired);
		expect(storedProtected?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
	});
});
