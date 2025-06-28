import { z } from 'zod';

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
	images: z.array(z.string()),
});

export type itemDetailResponseType = z.infer<typeof itemDetailResponseSchema>;
