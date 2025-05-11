import { items } from '@workspace/server/database';
import { createInsertSchema } from 'drizzle-zod';
import { number, string, z } from 'zod';

const imageFileSchema = z.instanceof(File).refine((file) => file.type.startsWith('image/'), {
	message: 'Only image files are allowed',
});

export const multipleImagesSchema = z
	.array(imageFileSchema)
	.nonempty({ message: 'At least one image is required' })
	.min(1, 'At least 1 image is required')
	.max(5, { message: 'You can upload up to 6 images at once' });

export const propertySchema = z.object({
	id: number(),
	slug: string(),
	value: z.union([z.string(), z.number(), z.array(z.string()), z.array(z.number())]),
});

export const createItemSchema = z.object({
	commons: createInsertSchema(items, {
		title: (schema) =>
			schema
				.min(5, 'Title must be at least 5 characters')
				.max(180)
				.regex(/^[a-zA-Z0-9\s]+$/, 'Title can only contain letters, numbers, and spaces'),
		description: (schema) => schema.min(50, 'Description must be at least 100 characters').max(2500),
		price: number().min(0.01, 'Price must be greater than 0'),
		shipping_price: number().optional(),
	}).omit({
		user_id: true,
		published: true,
		status: true,
		created_at: true,
		updated_at: true,
		deleted_at: true,
	}),
	properties: z.array(propertySchema).optional(),
});

export type createItemTypes = z.infer<typeof createItemSchema>;
