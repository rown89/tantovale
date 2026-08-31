import { and, eq, inArray, lt, notExists } from 'drizzle-orm';
import { subHours } from 'date-fns';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { orders_proposals } from 'src/database/schemas/orders_proposals';
import { orders } from 'src/database/schemas/orders';
import { authPath, environment } from 'src/utils/constants';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { TransactionSyncService } from '../payments/transaction-sync.service';
import { ORDER_PHASES, ORDER_PROPOSAL_PHASES, PAYMENT_CREATION_STATES } from 'src/database/schemas/enumerated_values';
import { acquireItemCommerceLock } from 'src/lib/item-commerce-lock';

const expiredOrdersTolleranceInHours = environment.ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS;
const expiredProposalsTolleranceInHours = environment.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS;

export const cronRoute = createRouter()
	.get(`${authPath}/expired-orders-check`, authMiddleware, async (c) => {
		const { db } = createClient();

		const { key } = c.req.query();
		const secretKey = environment.DAILY_ORDER_CHECK_SECRET_KEY;

		if (key !== secretKey) return c.json({ error: 'Invalid key' }, 401);

		// Calculate date that is orders payment tollerance hours ago from creation date
		const tolleranceDate = subHours(new Date(), expiredOrdersTolleranceInHours);

		const candidates = await db
			.select({ id: orders.id, item_id: orders.item_id })
			.from(orders)
			.where(
				and(
					eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
					eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
					lt(orders.created_at, tolleranceDate),
				),
			);
		const updatedOrders = (
			await Promise.all(
				candidates.map(({ id, item_id }) =>
					db.transaction(async (tx) => {
						if (item_id) await acquireItemCommerceLock(tx, item_id);
						const [updated] = await tx
							.update(orders)
							.set({ status: ORDER_PHASES.EXPIRED, updated_at: new Date() })
							.where(
								and(
									eq(orders.id, id),
									eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
									eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
									lt(orders.created_at, tolleranceDate),
								),
							)
							.returning({ id: orders.id });
						return updated;
					}),
				),
			)
		).filter((order): order is { id: number } => order !== undefined);

		if (!updatedOrders.length) return c.json({ message: 'No orders to cancel', status: 200 }, 200);

		return c.json({ orders: updatedOrders, status: 200, message: 'Orders expired' }, 200);
	})
	.get(`${authPath}/expired-proposals-check`, authMiddleware, async (c) => {
		const { db } = createClient();

		const { key } = c.req.query();

		const secretKey = environment.DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY;

		if (key !== secretKey) {
			return c.json({ error: 'Invalid key' }, 401);
		}

		// Calculate date that is proposals tollerance hours ago from creation date
		const toleranceDate = subHours(new Date(), expiredProposalsTolleranceInHours);

		const candidates = await db
			.select({ id: orders_proposals.id, item_id: orders_proposals.item_id })
			.from(orders_proposals)
			.where(
				and(eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending), lt(orders_proposals.created_at, toleranceDate)),
			);
		const updatedProposals = (
			await Promise.all(
				candidates.map(({ id, item_id }) =>
					db.transaction(async (tx) => {
						if (item_id) await acquireItemCommerceLock(tx, item_id);
						const [updated] = await tx
							.update(orders_proposals)
							.set({ status: ORDER_PROPOSAL_PHASES.expired, updated_at: new Date() })
							.where(
								and(
									eq(orders_proposals.id, id),
									eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
									lt(orders_proposals.created_at, toleranceDate),
									notExists(
										tx
											.select({ id: orders.id })
											.from(orders)
											.where(
												and(
													eq(orders.order_proposal_id, id),
													inArray(orders.payment_creation_state, [
														PAYMENT_CREATION_STATES.PREPARING,
														PAYMENT_CREATION_STATES.CREATING,
														PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
													]),
												),
											),
									),
								),
							)
							.returning({ id: orders_proposals.id });
						return updated;
					}),
				),
			)
		).filter((proposal): proposal is { id: number } => proposal !== undefined);

		if (!updatedProposals.length) return c.json({ message: 'No proposals to cancel', status: 200 }, 200);

		return c.json({ proposals: updatedProposals, status: 200, message: 'Proposals expired' }, 200);
	})
	.get(`${authPath}/sync-transactions`, authMiddleware, async (c) => {
		const { key } = c.req.query();
		const secretKey = environment.TRANSACTIONS_SYNC_SECRET_KEY;

		if (key !== secretKey) {
			return c.json({ error: 'Invalid key' }, 401);
		}

		try {
			const syncService = new TransactionSyncService();
			const result = await syncService.syncTransactionStatuses();

			return c.json(result, 200);
		} catch (error) {
			console.error('Transaction sync error:', error);
			return c.json({ error: 'Failed to sync transactions' }, 500);
		}
	});
