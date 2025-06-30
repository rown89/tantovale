import { and, eq, lt } from 'drizzle-orm';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { subHours } from 'date-fns';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { orders_proposals } from 'src/database/schemas/orders_proposals';
import { orders } from 'src/database/schemas/orders';
import { authPath, environment } from 'src/utils/constants';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { TransactionSyncService } from '../payments/transaction-sync.service';
import { ORDER_PHASES, ORDER_PROPOSAL_PHASES } from 'src/database/schemas/enumerated_values';

const expiredOrdersTolleranceInHours = environment.ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS;
const expiredProposalsTolleranceInHours = environment.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS;

export const cronRoute = createRouter()
	.get(`${authPath}/expired-orders-check`, authMiddleware, async (c) => {
		const { db } = createClient();

		const { key } = c.req.param();
		const secretKey = environment.DAILY_ORDER_CHECK_SECRET_KEY;

		if (key !== secretKey) return c.json({ error: 'Invalid key' }, 401);

		// Calculate date that is orders payment tollerance hours ago from creation date
		const tolleranceDate = subHours(new Date(), expiredOrdersTolleranceInHours);

		const result = await db.transaction(async (tx) => {
			const updatedOrders = await tx
				.update(orders)
				.set({ status: ORDER_PHASES.EXPIRED })
				.where(and(eq(orders.status, ORDER_PHASES.PAYMENT_PENDING), lt(orders.created_at, tolleranceDate)))
				.returning({ id: orders.id });

			if (!updatedOrders.length) return { message: 'No orders to cancel', status: 200 };

			return { orders: updatedOrders, status: 200, message: 'Orders expired' };
		});

		return c.json(result, result.status as ContentfulStatusCode);
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

		const result = await db.transaction(async (tx) => {
			const updatedProposals = await tx
				.update(orders_proposals)
				.set({ status: ORDER_PROPOSAL_PHASES.expired })
				.where(
					and(
						eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
						lt(orders_proposals.created_at, toleranceDate),
					),
				)
				.returning({ id: orders_proposals.id });

			if (!updatedProposals.length) return { message: 'No proposals to cancel', status: 200 };

			return { proposals: updatedProposals, status: 200, message: 'Proposals expired' };
		});

		return c.json(result, result.status as ContentfulStatusCode);
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
