import {
	pgTable,
	unique,
	integer,
	text,
	boolean,
	timestamp,
	foreignKey,
	varchar,
	json,
	numeric,
	uuid,
	smallint,
	date,
	pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const addressStatusEnum = pgEnum('address_status_enum', ['active', 'inactive', 'deleted']);
export const chatMessageTypeEnum = pgEnum('chat_message_type_enum', ['text', 'proposal']);
export const itemImagesSizeEnum = pgEnum('item_images_size_enum', ['original', 'small', 'medium', 'thumbnail']);
export const profileTypesEnum = pgEnum('profile_types_enum', ['private', 'private_pro', 'shop', 'shop_pro']);
export const proposalStatusEnum = pgEnum('proposal_status_enum', ['pending', 'accepted', 'rejected', 'expired']);
export const sexEnum = pgEnum('sex_enum', ['male', 'female']);
export const statusEnum = pgEnum('status_enum', ['available', 'sold', 'pending', 'archived']);
export const transactionCurrencyEnum = pgEnum('transaction_currency_enum', [
	'usd',
	'eur',
	'gbp',
	'cad',
	'aud',
	'jpy',
	'cny',
	'inr',
	'brl',
	'ars',
	'clp',
	'cop',
	'mxn',
	'pen',
	'pyg',
	'uyu',
	'vef',
	'vnd',
	'zar',
]);

export const categories = pgTable(
	'categories',
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: 'categories_id_seq',
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		name: text().notNull(),
		slug: text().notNull(),
		menuOrder: integer('menu_order').default(0).notNull(),
		published: boolean().default(true).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => [unique('categories_slug_unique').on(table.slug)],
);

export const items = pgTable('items', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'items_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	userId: integer('user_id').notNull(),
	subcategoryId: integer('subcategory_id').notNull(),
	addressId: integer('address_id').notNull(),
	title: text().notNull(),
	description: text().notNull(),
	status: statusEnum().default('available').notNull(),
	published: boolean().default(false).notNull(),
	price: integer().default(0).notNull(),
	easyPay: boolean('easy_pay').default(false).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp('deleted_at', { mode: 'string' }),
});

export const chatRooms = pgTable(
	'chat_rooms',
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: 'chat_rooms_id_seq',
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		itemId: integer('item_id').notNull(),
		buyerId: integer('buyer_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.itemId],
			foreignColumns: [items.id],
			name: 'chat_rooms_item_id_items_id_fk',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.buyerId],
			foreignColumns: [users.id],
			name: 'chat_rooms_buyer_id_users_id_fk',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const countries = pgTable('countries', {
	id: integer().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	iso3: varchar({ length: 3 }).notNull(),
	iso2: varchar({ length: 2 }).notNull(),
	numericCode: varchar('numeric_code', { length: 15 }),
	phonecode: varchar({ length: 15 }).notNull(),
	capital: varchar({ length: 255 }),
	currency: varchar({ length: 10 }),
	currencyName: varchar('currency_name', { length: 255 }),
	currencySymbol: varchar('currency_symbol', { length: 10 }),
	tld: varchar({ length: 10 }),
	native: varchar({ length: 255 }),
	region: varchar({ length: 255 }),
	regionId: integer('region_id'),
	subregion: varchar({ length: 255 }),
	subregionId: integer('subregion_id'),
	nationality: varchar({ length: 255 }),
	timezones: json(),
	translations: json(),
	latitude: numeric({ precision: 10, scale: 8 }),
	longitude: numeric({ precision: 11, scale: 8 }),
	emoji: varchar({ length: 5 }),
	emojiU: varchar('emoji_u', { length: 25 }),
});

export const itemsImages = pgTable('items_images', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'items_images_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	itemId: integer('item_id').notNull(),
	url: text().notNull(),
	orderPosition: integer('order_position').default(0).notNull(),
	size: itemImagesSizeEnum().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const itemsPropertiesValues = pgTable('items_properties_values', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'items_properties_values_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	itemId: integer('item_id').notNull(),
	propertyValueId: integer('property_value_id').notNull(),
});

export const addresses = pgTable(
	'addresses',
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: 'addresses_id_seq',
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		profileId: integer('profile_id'),
		streetAddress: text('street_address').notNull(),
		cityId: integer('city_id').notNull(),
		provinceId: integer('province_id').notNull(),
		postalCode: integer('postal_code').notNull(),
		countryCode: varchar('country_code', { length: 50 }).default('IT').notNull(),
		status: addressStatusEnum().default('active').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.profileId],
			foreignColumns: [profiles.id],
			name: 'addresses_profile_id_profiles_id_fk',
		}),
		foreignKey({
			columns: [table.cityId],
			foreignColumns: [cities.id],
			name: 'addresses_city_id_cities_id_fk',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.provinceId],
			foreignColumns: [cities.id],
			name: 'addresses_province_id_cities_id_fk',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const ordersItems = pgTable('orders_items', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'orders_items_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	orderId: integer('order_id'),
	itemId: integer('item_id'),
	finishedPrice: integer('finished_price').notNull(),
	orderStatus: text('order_status').default('payment_pending').notNull(),
	createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const orders = pgTable('orders', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'orders_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	buyerId: integer('buyer_id'),
	sellerId: integer('seller_id'),
	createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'password_reset_tokens_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	userId: integer('user_id').notNull(),
	token: text().notNull(),
	expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const ordersProposals = pgTable('orders_proposals', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'orders_proposals_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	itemId: integer('item_id'),
	userId: integer('user_id'),
	proposalPrice: integer('proposal_price').notNull(),
	status: proposalStatusEnum().default('pending').notNull(),
	createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const propertyValues = pgTable('property_values', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'property_values_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	propertyId: integer('property_id').notNull(),
	name: text().notNull(),
	value: text(),
	booleanValue: boolean('boolean_value'),
	numericValue: integer('numeric_value'),
	icon: text(),
	meta: text(),
});

export const properties = pgTable(
	'properties',
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: 'properties_id_seq',
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		name: text().notNull(),
		slug: text().notNull(),
		type: text().notNull(),
	},
	(table) => [unique('properties_slug_unique').on(table.slug)],
);

export const refreshTokens = pgTable(
	'refresh_tokens',
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		username: text().notNull(),
		token: text().notNull(),
		expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => [unique('refresh_tokens_token_unique').on(table.token)],
);

export const regions = pgTable('regions', {
	id: integer().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	translations: json().notNull(),
	wikiDataId: varchar('wiki_data_id', { length: 255 }).notNull(),
});

export const shippingsOrders = pgTable('shippings_orders', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'shippings_orders_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	shippingId: integer('shipping_id'),
	orderId: integer('order_id'),
	createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const shippings = pgTable('shippings', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'shippings_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	itemId: integer('item_id'),
	shippingPrice: integer('shipping_price').notNull(),
	trackingNumber: text('tracking_number'),
	trackingUrl: text('tracking_url'),
	trackingStatus: text('tracking_status'),
	trackingStatusDescription: text('tracking_status_description'),
	trackingStatusUpdatedAt: timestamp('tracking_status_updated_at', { mode: 'string' }),
	createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const subcategories = pgTable(
	'subcategories',
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: 'subcategories_id_seq',
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		name: text().notNull(),
		slug: text().notNull(),
		categoryId: integer('category_id').notNull(),
		parentId: integer('parent_id'),
		easyPay: boolean('easy_pay'),
		menuOrder: integer('menu_order').default(0).notNull(),
		published: boolean().default(true).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => [unique('subcategories_slug_unique').on(table.slug)],
);

export const states = pgTable('states', {
	id: integer().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	countryId: integer('country_id').notNull(),
	countryCode: varchar('country_code', { length: 2 }).notNull(),
	stateCode: varchar('state_code', { length: 10 }).notNull(),
	type: varchar({ length: 50 }),
	latitude: numeric({ precision: 10, scale: 8 }),
	longitude: numeric({ precision: 11, scale: 8 }),
});

export const cities = pgTable(
	'cities',
	{
		id: integer().primaryKey().notNull(),
		name: varchar({ length: 255 }).notNull(),
		stateId: integer('state_id').notNull(),
		stateCode: varchar('state_code', { length: 10 }).notNull(),
		countryId: integer('country_id').notNull(),
		countryCode: varchar('country_code', { length: 2 }).notNull(),
		latitude: numeric({ precision: 10, scale: 8 }).notNull(),
		longitude: numeric({ precision: 11, scale: 8 }).notNull(),
		flag: smallint().default(1).notNull(),
		wikiDataId: varchar({ length: 255 }),
	},
	(table) => [
		foreignKey({
			columns: [table.stateId],
			foreignColumns: [states.id],
			name: 'cities_state_id_states_id_fk',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const subcategoryProperties = pgTable('subcategory_properties', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'subcategory_properties_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	propertyId: integer('property_id').notNull(),
	subcategoryId: integer('subcategory_id').notNull(),
	position: integer().default(0).notNull(),
	onItemCreateRequired: boolean('on_item_create_required').default(false).notNull(),
	onItemUpdateEditable: boolean('on_item_update_editable').default(true).notNull(),
	isSearchable: boolean('is_searchable').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const subRegions = pgTable('sub_regions', {
	id: integer().primaryKey().notNull(),
	name: text().notNull(),
	regionId: integer('region_id').notNull(),
	translations: json().notNull(),
	wikiDataId: varchar('wiki_data_id', { length: 100 }).notNull(),
});

export const userItemsFavorites = pgTable('user_items_favorites', {
	id: integer()
		.primaryKey()
		.generatedAlwaysAsIdentity({
			name: 'user_items_favorites_id_seq',
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	userId: integer('user_id').notNull(),
	itemId: integer('item_id').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const profiles = pgTable(
	'profiles',
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: 'profiles_id_seq',
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		profileType: profileTypesEnum('profile_type').default('private').notNull(),
		userId: integer('user_id').notNull(),
		name: varchar({ length: 50 }).notNull(),
		surname: varchar({ length: 50 }).notNull(),
		vatNumber: varchar('vat_number', { length: 50 }),
		birthday: date(),
		gender: sexEnum().notNull(),
		privacyPolicy: boolean('privacy_policy').default(false).notNull(),
		marketingPolicy: boolean('marketing_policy').default(false).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => [unique('profiles_user_id_unique').on(table.userId)],
);

export const chatMessages = pgTable(
	'chat_messages',
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: 'chat_messages_id_seq',
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		chatRoomId: integer('chat_room_id').notNull(),
		senderId: integer('sender_id').notNull(),
		message: text().notNull(),
		messageType: chatMessageTypeEnum('message_type').default('text').notNull(),
		orderProposalId: integer('order_proposal_id'),
		readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.chatRoomId],
			foreignColumns: [chatRooms.id],
			name: 'chat_messages_chat_room_id_chat_rooms_id_fk',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.senderId],
			foreignColumns: [users.id],
			name: 'chat_messages_sender_id_users_id_fk',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.orderProposalId],
			foreignColumns: [ordersProposals.id],
			name: 'chat_messages_order_proposal_id_orders_proposals_id_fk',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const users = pgTable(
	'users',
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: 'users_id_seq',
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		username: varchar({ length: 50 }).notNull(),
		email: varchar({ length: 255 }).notNull(),
		phone: varchar({ length: 30 }),
		password: varchar({ length: 255 }).notNull(),
		emailVerified: boolean('email_verified').default(false).notNull(),
		phoneVerified: boolean('phone_verified').default(false).notNull(),
		isBanned: boolean('is_banned').default(false).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => [unique('users_username_unique').on(table.username), unique('users_email_unique').on(table.email)],
);
