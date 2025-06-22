import { ordersProposalsSelectSchema } from '#database/schemas/orders_proposals';
import { z } from 'zod/v4';

export const create_order_proposal_schema = z.object({
	item_id: z.number().min(1),
	proposal_price: z.number().min(0.01),
	message: z.string(),
});

export const update_order_proposal_schema = ordersProposalsSelectSchema.pick({
	id: true,
	status: true,
	item_id: true,
});
