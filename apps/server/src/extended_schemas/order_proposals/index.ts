import { z } from 'zod';

export const create_order_proposal_schema = z.object({
	item_id: z.number(),
	proposal_price: z.number(),
	message: z.string(),
});

export const update_order_proposal_schema = z.object({
	id: z.number(),
	status: z.enum(['accepted', 'rejected']),
	item_id: z.number(),
});
