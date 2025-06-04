import { items } from '@workspace/server/database';
import { createInsertSchema } from 'drizzle-zod';
import { boolean, number, string, z } from 'zod';

const imageFileSchema = z.instanceof(File).refine((file) => file.type.startsWith('image/'), {
	message: 'Only image files are allowed',
});

export const multipleImagesSchema = z
	.array(imageFileSchema)
	.nonempty({ message: 'At least one image is required' })
	.min(1, 'At least 1 image is required')
	.max(5, { message: 'You can upload up to 6 images at once' });

export const shippingPriceSchema = z.number().optional();

export const propertySchema = z.array(
	z.object({
		id: number(),
		slug: string(),
		value: z.union([z.string(), z.number(), z.array(z.string()), z.array(z.number()), z.boolean()]),
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
		easy_pay: boolean().optional(),
		price: number()
			.min(priceMin, `Price must be greater than ${priceMin}`)
			.max(priceMax, `Price must be less or equal to ${priceMax / 100} €`),
	}).omit({
		user_id: true,
		published: true,
		status: true,
		created_at: true,
		updated_at: true,
		deleted_at: true,
	}),
	shipping_price: shippingPriceSchema,
	properties: propertySchema.optional(),
});

export type createItemTypes = z.infer<typeof createItemSchema>;
