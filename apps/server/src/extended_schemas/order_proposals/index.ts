import { ORDER_PROPOSAL_PHASES } from '#database/schemas/enumerated_values';
import { ordersProposalsSelectSchema } from '#database/schemas/orders_proposals';
import { z } from 'zod/v4';

export const create_order_proposal_schema = z.object({
	item_id: z.number().min(1),
	proposal_price: z.number().min(0.01),
	shipping_label_id: z.string().min(1),
	message: z.string(),
});

export const seller_update_order_proposal_schema = ordersProposalsSelectSchema
	.pick({
		id: true,
		status: true,
		item_id: true,
	})
	.extend({
		status: z.enum([ORDER_PROPOSAL_PHASES.accepted, ORDER_PROPOSAL_PHASES.rejected]),
	});

export const buyer_abort_proposal_schema = z.object({
	item_id: z.number(),
	proposal_id: z.number(),
});
