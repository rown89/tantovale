import { and, eq, lt } from 'drizzle-orm';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { startOfDay } from 'date-fns';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { orders_items } from 'src/database/schemas/orders_items';
import { orders_proposals } from 'src/database/schemas/orders_proposals';
import { authPath } from 'src/utils/constants';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { parseEnv } from 'src/env';

export const cronRoute = createRouter()
	.get(`${authPath}/expired-orders-check`, authMiddleware, async (c) => {
		const { db } = createClient();

		const { key } = c.req.param();
		const secretKey = parseEnv(process.env).DAILY_ORDER_CHECK_SECRET_KEY;

		if (key !== secretKey) return c.json({ error: 'Invalid key' }, 401);

		// Get start of today in UTC to ensure consistent timezone handling
		const dateNow = startOfDay(new Date());

		const result = await db.transaction(async (tx) => {
			const updatedOrders = await tx
				.update(orders_items)
				.set({ order_status: 'expired' })
				.where(and(eq(orders_items.order_status, 'pending'), lt(orders_items.created_at, dateNow)))
				.returning({ id: orders_items.id });

			if (!updatedOrders.length) return { message: 'No orders to cancel', status: 200 };

			return { orders: updatedOrders, status: 200, message: 'Orders expired' };
		});

		return c.json(result, result.status as ContentfulStatusCode);
	})
	.get(`${authPath}/expired-proposals-check`, authMiddleware, async (c) => {
		const { db } = createClient();

		const { key } = c.req.query();

		const secretKey = parseEnv(process.env).DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY;

		if (key !== secretKey) {
			return c.json({ error: 'Invalid key' }, 401);
		}

		// Get start of today in UTC to ensure consistent timezone handling
		const dateNow = startOfDay(new Date());

		const result = await db.transaction(async (tx) => {
			const updatedProposals = await tx
				.update(orders_proposals)
				.set({ status: 'expired' })
				.where(and(eq(orders_proposals.status, 'pending'), lt(orders_proposals.created_at, dateNow)))
				.returning({ id: orders_proposals.id });

			if (!updatedProposals.length) return { message: 'No proposals to cancel', status: 200 };

			return { proposals: updatedProposals, status: 200, message: 'Proposals expired' };
		});

		return c.json(result, result.status as ContentfulStatusCode);
	});
