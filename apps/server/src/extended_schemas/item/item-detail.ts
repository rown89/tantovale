import { ORDER_PROPOSAL_PHASES } from '#database/schemas/enumerated_values';
import { z } from 'zod/v4';

export const itemDetailResponseSchema = z.object({
	id: z.number(),
	user: z.object({
		id: z.number(),
		username: z.string(),
	}),
	title: z.string(),
	description: z.string(),
	price: z.number(),
	order: z.object({
		id: z.number().nullable(),
		status: z.string().optional(),
	}),
	orderProposal: z.object({
		id: z.number().nullable(),
		created_at: z.string().optional(),
		status: z.enum(ORDER_PROPOSAL_PHASES).optional(),
	}),
	location: z.object({
		city: z.object({
			id: z.number(),
			name: z.string(),
		}),
		province: z.object({
			id: z.number(),
			name: z.string(),
		}),
	}),
	easy_pay: z.boolean(),
	subcategory: z.object({
		name: z.string(),
		slug: z.string(),
	}),
	properties: z.array(
		z.object({
			name: z.string().nullable(),
			value: z.string().nullable(),
			boolean_value: z.boolean().nullable(),
			numeric_value: z.number().nullable(),
		}),
	),
	images: z.array(z.string()),
});

export type itemDetailResponseType = z.infer<typeof itemDetailResponseSchema>;
