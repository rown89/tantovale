import { z, number, string } from 'zod';
import { relations } from 'drizzle-orm';
import { pgTable, integer, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './users';
import { statusEnum } from './enumerated_types';
import { subcategories } from './subcategories';

export const items = pgTable(
	'items',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		title: text('title').notNull(),
		description: text('description').notNull(),
		status: statusEnum('status').notNull().default('available'),
		published: boolean('published').default(false).notNull(),
		price: integer('price').notNull().default(0),
		shipping_cost: integer('shipping_cost').notNull().default(0),
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		subcategory_id: integer('subcategory_id')
			.notNull()
			.references(() => subcategories.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			}),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { mode: 'date' }),
	},
	(table) => [
		index('user_id_idx').on(table.user_id),
		index('title_idx').on(table.title),
		index('subcategory_id_idx').on(table.subcategory_id),
	],
);

export const itemsRelations = relations(items, ({ one, many }) => ({
	author: one(users, {
		fields: [items.user_id],
		references: [users.id],
	}),
	subcategory: one(subcategories, {
		fields: [items.subcategory_id],
		references: [subcategories.id],
	}),
}));

export type SelectItem = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

export const selectItemsSchema = createSelectSchema(items);

export const insertItemsSchema = createInsertSchema(items);

export const patchItemsSchema = insertItemsSchema.partial();

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
		title: (schema) => schema.min(5, 'Title must be at least 5 characters').max(180),
		description: (schema) => schema.min(100, 'Description must be at least 100 characters').max(800),
		price: number().min(0.01, 'Price must be greater than 0'),
		delivery_method: z.enum(['shipping', 'pickup'], {
			errorMap: () => ({
				message: "Delivery method must be 'shipping' or 'pickup'.",
			}),
		}),
	}).omit({
		user_id: true,
		published: true,
		status: true,
		shipping_cost: true,
		created_at: true,
		updated_at: true,
	}),

	properties: z.array(propertySchema).optional(),
});

export type createItemTypes = z.infer<typeof createItemSchema>;
