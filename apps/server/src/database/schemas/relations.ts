import { defineRelations } from 'drizzle-orm';

import * as schema from './schema';

export const relations = defineRelations(schema, (r) => ({
	addresses: {
		profile: r.many.profiles({
			from: r.addresses.profile_id,
			to: r.profiles.id,
		}),
	},
	categories: {
		subcategories: r.many.subcategories({
			from: r.categories.id,
			to: r.subcategories.category_id,
		}),
	},
	chat_messages: {
		chat_room: r.one.chat_rooms({
			from: r.chat_messages.chat_room_id,
			to: r.chat_rooms.id,
		}),
		sender: r.one.profiles({
			from: r.chat_messages.sender_id,
			to: r.profiles.id,
		}),
		order_proposal: r.one.orders_proposals({
			from: r.chat_messages.order_proposal_id,
			to: r.orders_proposals.id,
		}),
	},
	chat_rooms: {
		item: r.one.items({
			from: r.chat_rooms.item_id,
			to: r.items.id,
		}),
		buyer: r.one.profiles({
			from: r.chat_rooms.buyer_id,
			to: r.profiles.id,
		}),
		messages: r.many.chat_messages({
			from: r.chat_rooms.id,
			to: r.chat_messages.chat_room_id,
		}),
	},
	cities: {
		state: r.one.states({
			from: r.cities.state_id,
			to: r.states.id,
		}),
		country: r.one.countries({
			from: r.cities.country_id,
			to: r.countries.id,
		}),
	},
	countries: {
		regionByRegionId: r.one.regions({
			from: r.countries.region_id,
			to: r.regions.id,
		}),
		subRegion: r.one.subRegions({
			from: r.countries.subregion_id,
			to: r.subRegions.id,
		}),
		states: r.many.states({
			from: r.countries.id,
			to: r.states.country_id,
		}),
		cities: r.many.cities({
			from: r.countries.id,
			to: r.cities.country_id,
		}),
	},
	entityTrustapTransactions: {
		item: r.one.items({
			from: r.entityTrustapTransactions.entityId,
			to: r.items.id,
		}),
	},
	items: {
		author: r.one.profiles({
			from: r.items.profile_id,
			to: r.profiles.id,
		}),
		subcategory: r.one.subcategories({
			from: r.items.subcategory_id,
			to: r.subcategories.id,
		}),
		address: r.one.addresses({
			from: r.items.address_id,
			to: r.addresses.id,
		}),
	},
	items_images: {
		item: r.one.items({
			from: r.items_images.item_id,
			to: r.items.id,
		}),
	},
	items_properties_values: {
		property_value: r.one.property_values({
			from: r.items_properties_values.property_value_id,
			to: r.property_values.id,
		}),
		item: r.one.items({
			from: r.items_properties_values.item_id,
			to: r.items.id,
		}),
	},
	orders: {
		buyer: r.one.profiles({
			from: r.orders.buyer_id,
			to: r.profiles.id,
			alias: 'orders_buyerId_profiles_id',
		}),
		seller: r.one.profiles({
			from: r.orders.seller_id,
			to: r.profiles.id,
			alias: 'orders_sellerId_profiles_id',
		}),
	},
	orders_proposals: {
		item: r.one.items({
			from: r.orders_proposals.item_id,
			to: r.items.id,
		}),
		profile: r.one.profiles({
			from: r.orders_proposals.profile_id,
			to: r.profiles.id,
		}),
	},
	password_reset_tokens: {
		user: r.one.users({
			from: r.password_reset_tokens.user_id,
			to: r.users.id,
		}),
	},
	profiles: {
		user: r.one.users({
			from: r.profiles.user_id,
			to: r.users.id,
		}),
	},
	profiles_items_favorites: {
		profile: r.one.profiles({
			from: r.profiles_items_favorites.profile_id,
			to: r.profiles.id,
		}),
		item: r.one.items({
			from: r.profiles_items_favorites.item_id,
			to: r.items.id,
		}),
	},
	property_values: {
		property: r.one.properties({
			from: r.property_values.property_id,
			to: r.properties.id,
		}),
	},
	regions: {
		countries: r.many.countries({
			from: r.regions.id,
			to: r.countries.region_id,
		}),
		subRegions: r.many.subRegions({
			from: r.regions.id,
			to: r.subRegions.region_id,
		}),
	},
	shippings: {
		item: r.one.items({
			from: r.shippings.item_id,
			to: r.items.id,
		}),
	},
	states: {
		country: r.one.countries({
			from: r.states.country_id,
			to: r.countries.id,
		}),
		cities: r.many.cities({
			from: r.states.id,
			to: r.cities.state_id,
		}),
	},
	subRegions: {
		region: r.one.regions({
			from: r.subRegions.region_id,
			to: r.regions.id,
		}),
		countries: r.many.countries({
			from: r.subRegions.id,
			to: r.countries.subregion_id,
		}),
	},
	subcategories: {
		category: r.one.categories({
			from: r.subcategories.category_id,
			to: r.categories.id,
		}),
		items: r.many.items({
			from: r.subcategories.id,
			to: r.items.subcategory_id,
		}),
		parent: r.one.subcategories({
			from: r.subcategories.parent_id,
			to: r.subcategories.id,
		}),
	},
	subcategory_properties: {
		property: r.one.properties({
			from: r.subcategory_properties.property_id,
			to: r.properties.id,
		}),
		subcategory: r.one.subcategories({
			from: r.subcategory_properties.subcategory_id,
			to: r.subcategories.id,
		}),
	},
	users: {
		resetTokens: r.many.password_reset_tokens({
			from: r.users.id,
			to: r.password_reset_tokens.user_id,
		}),
	},
}));
