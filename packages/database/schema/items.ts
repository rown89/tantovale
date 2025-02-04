import { relations } from 'drizzle-orm';
import { pgTable, integer, text, timestamp, boolean, numeric, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { conditionEnum, deliveryMethodEnum, statusEnum } from './enumerated_types';
import { subcategories } from './subcategories';

export const items = pgTable(
	'items',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		title: text('title').notNull(),
		description: text('description').notNull(),
		price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0.00'),
		condition: conditionEnum('condition').notNull().default('used'),
		status: statusEnum('status').notNull().default('available'),
		deliveryMethod: deliveryMethodEnum('delivery_method').notNull().default('pickup'),
		draft: boolean('draft').notNull().default(false),
		published: boolean('published').default(false).notNull(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		subcategoryId: integer('subcategory_id')
			.notNull()
			.references(() => subcategories.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index('user_id_idx').on(table.userId),
		index('title_idx').on(table.title),
		index('subcategory_id_idx').on(table.subcategoryId),
	],
);

export const itemsRelations = relations(items, ({ one, many }) => ({
	author: one(users, {
		fields: [items.userId],
		references: [users.id],
	}),
	subcategory: one(subcategories, {
		fields: [items.subcategoryId],
		references: [subcategories.id],
	}),
}));
