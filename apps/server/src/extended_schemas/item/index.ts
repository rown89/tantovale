import { createInsertSchema } from 'drizzle-zod';
import { boolean, array, number, string, z } from 'zod/v4';

import { items } from '@workspace/server/database';

const imageFileSchema = z.instanceof(File).refine((file) => file.type.startsWith('image/'), {
	message: 'Only image files are allowed',
});

export const multipleImagesSchema = z
	.array(imageFileSchema)
	.nonempty({ message: 'At least one image is required' })
	.min(1, 'At least 1 image is required')
	.max(5, { message: 'You can upload up to 6 images at once' });

export const shippingSchema = z.object({
	item_weight: number().optional(),
	item_length: number().optional(),
	item_width: number().optional(),
	item_height: number().optional(),
	shipping_price: z.number().optional(),
});

export const propertySchema = z.array(
	z.object({
		id: number(),
		slug: string(),
		value: z.union([string(), number(), array(string()), array(number()), boolean()]),
	}),
);

const titleMinLength = 5;
const titleMaxLength = 180;

export const minDescriptionLength = 50;
export const maxDescriptionLength = 2500;

export const priceMin = 0.01;
export const priceMax = 1000000;

export const createItemSchema = z.object({
	commons: createInsertSchema(items, {
		title: (schema) =>
			schema
				.min(titleMinLength, 'Title must be at least 5 characters')
				.max(titleMaxLength)
				.regex(/^[a-zA-Z0-9\s]+$/, 'Title can only contain letters, numbers, and spaces'),
		description: (schema) =>
			schema
				.min(minDescriptionLength, `Description must be at least ${minDescriptionLength} characters`)
				.max(maxDescriptionLength, `Description must be less than ${maxDescriptionLength} characters`),
		easy_pay: (schema) => schema.optional(),
		price: (schema) =>
			schema
				.min(priceMin, `Price must be greater than ${priceMin}`)
				.max(priceMax, `Price must be less or equal to ${priceMax / 100} €`),
	}).omit({
		profile_id: true,
		published: true,
		status: true,
		created_at: true,
		updated_at: true,
		deleted_at: true,
	}),
	shipping: shippingSchema.optional(),
	properties: propertySchema.optional(),
});

export type createItemTypes = z.infer<typeof createItemSchema>;
