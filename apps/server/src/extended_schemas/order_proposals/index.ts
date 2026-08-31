import { ORDER_PROPOSAL_PHASES } from '#database/schemas/enumerated_values';
import { ordersProposalsSelectSchema } from '#database/schemas/orders_proposals';
import { z } from 'zod/v4';

export const create_order_proposal_schema = z.object({
	item_id: z.number().int().positive().max(2_147_483_647),
	proposal_price: z.number().int().positive().max(2_147_483_647),
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
		id: z.number().int().positive().max(2_147_483_647),
		item_id: z.number().int().positive().max(2_147_483_647),
		status: z.enum([ORDER_PROPOSAL_PHASES.accepted, ORDER_PROPOSAL_PHASES.rejected]),
	});

export const buyer_abort_proposal_schema = z.object({
	proposal_id: z.number().int().positive().max(2_147_483_647),
});
