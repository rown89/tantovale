import { defineRelations } from 'drizzle-orm';

import * as schema from './schema';

export const relations = defineRelations(schema, (r) => ({
	addresses: {
		profile: r.one.profiles({
			from: r.addresses.profile_id,
			to: r.profiles.id,
		}),
		cityCityId: r.one.cities({
			from: r.addresses.city_id,
			to: r.cities.id,
			alias: 'addresses_cityId_cities_id',
		}),
		cityProvinceId: r.one.cities({
			from: r.addresses.province_id,
			to: r.cities.id,
			alias: 'addresses_provinceId_cities_id',
		}),
		items: r.many.items({
			from: r.addresses.id,
			to: r.items.address_id,
		}),
		ordersBuyerAddress: r.many.orders({
			from: r.addresses.id,
			to: r.orders.buyer_address,
			alias: 'orders_buyerAddress_addresses_id',
		}),
		ordersSellerAddress: r.many.orders({
			from: r.addresses.id,
			to: r.orders.seller_address,
			alias: 'orders_sellerAddress_addresses_id',
		}),
	},
	categories: {
		subcategories: r.many.subcategories({
			from: r.categories.id,
			to: r.subcategories.category_id,
		}),
		nestedSubcategories: r.many.subcategories({
			from: r.categories.id.through(r.subcategories.category_id),
			to: r.subcategories.id.through(r.subcategories.parent_id),
			alias: 'categories_id_subcategories_id_via_subcategories',
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
	shipping_quotes: {
		item: r.one.items({ from: r.shipping_quotes.item_id, to: r.items.id }),
		buyer: r.one.profiles({
			from: r.shipping_quotes.buyer_profile_id,
			to: r.profiles.id,
			alias: 'shipping_quotes_buyer_profile_id_profiles_id',
		}),
		seller: r.one.profiles({
			from: r.shipping_quotes.seller_profile_id,
			to: r.profiles.id,
			alias: 'shipping_quotes_seller_profile_id_profiles_id',
		}),
	},
	cities: {
		addressesCityId: r.many.addresses({
			from: r.cities.id,
			to: r.addresses.city_id,
			alias: 'addresses_cityId_cities_id',
		}),
		addressesProvinceId: r.many.addresses({
			from: r.cities.id,
			to: r.addresses.province_id,
			alias: 'addresses_provinceId_cities_id',
		}),
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
			alias: 'states_countryId_countries_id',
		}),
		cities: r.many.cities({
			from: r.countries.id,
			to: r.cities.country_id,
		}),
		statesViaCities: r.many.states({
			from: r.countries.id.through(r.cities.country_id),
			to: r.states.id.through(r.cities.state_id),
			alias: 'countries_id_states_id_via_cities',
		}),
	},
	entityTrustapTransactions: {
		item: r.one.items({
			from: r.entityTrustapTransactions.entityId,
			to: r.items.id,
		}),
	},
	items: {
		profilesViaChatRooms: r.many.profiles({
			from: r.items.id.through(r.chat_rooms.item_id),
			to: r.profiles.id.through(r.chat_rooms.buyer_id),
			alias: 'profiles_id_items_id_via_chatRooms',
		}),
		author: r.one.profiles({
			from: r.items.profile_id,
			to: r.profiles.id,
			alias: 'items_profileId_profiles_id',
		}),
		subcategory: r.one.subcategories({
			from: r.items.subcategory_id,
			to: r.subcategories.id,
		}),
		address: r.one.addresses({
			from: r.items.address_id,
			to: r.addresses.id,
		}),
		itemsImages: r.many.items_images({
			from: r.items.id,
			to: r.items_images.item_id,
		}),
		propertyValues: r.many.property_values({
			from: r.items.id.through(r.items_properties_values.item_id),
			to: r.property_values.id.through(r.items_properties_values.property_value_id),
		}),
		orders: r.many.orders({
			from: r.items.id,
			to: r.orders.item_id,
		}),
		ordersProposalsItemId: r.many.orders_proposals({
			from: r.items.id,
			to: r.orders_proposals.item_id,
			alias: 'ordersProposals_itemId_items_id',
		}),
		shippingsItemId: r.many.shippings({
			from: r.items.id,
			to: r.shippings.item_id,
			alias: 'shippings_itemId_items_id',
		}),
		shippingLabelPurchases: r.many.shipping_label_purchases({
			from: r.items.id,
			to: r.shipping_label_purchases.item_id,
		}),
		profilesViaUserItemsFavorites: r.many.profiles({
			from: r.items.id.through(r.profiles_items_favorites.item_id),
			to: r.profiles.id.through(r.profiles_items_favorites.profile_id),
			alias: 'items_id_profiles_id_via_userItemsFavorites',
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
		item: r.one.items({
			from: r.orders.item_id,
			to: r.items.id,
		}),
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
		addressBuyerAddress: r.one.addresses({
			from: r.orders.buyer_address,
			to: r.addresses.id,
			alias: 'orders_buyerAddress_addresses_id',
		}),
		addressSellerAddress: r.one.addresses({
			from: r.orders.seller_address,
			to: r.addresses.id,
			alias: 'orders_sellerAddress_addresses_id',
		}),
		shippings: r.many.shippings({
			from: r.orders.id,
			to: r.shippings.order_id,
		}),
		paymentInvitation: r.one.payment_invitation_outbox({
			from: r.orders.id,
			to: r.payment_invitation_outbox.order_id,
		}),
		shippingLabelPurchase: r.one.shipping_label_purchases({
			from: r.orders.id,
			to: r.shipping_label_purchases.order_id,
		}),
	},
	payment_invitation_outbox: {
		order: r.one.orders({
			from: r.payment_invitation_outbox.order_id,
			to: r.orders.id,
		}),
	},
	orders_proposals: {
		chatMessages: r.many.chat_messages({
			from: r.orders_proposals.id,
			to: r.chat_messages.order_proposal_id,
		}),
		item: r.one.items({
			from: r.orders_proposals.item_id,
			to: r.items.id,
			alias: 'ordersProposals_itemId_items_id',
		}),
		profile: r.one.profiles({
			from: r.orders_proposals.profile_id,
			to: r.profiles.id,
			alias: 'ordersProposals_profileId_profiles_id',
		}),
	},
	password_reset_tokens: {
		user: r.one.users({
			from: r.password_reset_tokens.user_id,
			to: r.users.id,
		}),
	},
	profiles: {
		addresses: r.many.addresses({
			from: r.profiles.id,
			to: r.addresses.profile_id,
		}),
		chatMessages: r.many.chat_messages({
			from: r.profiles.id,
			to: r.chat_messages.sender_id,
		}),
		itemsViaChatRooms: r.many.items({
			from: r.profiles.id.through(r.chat_rooms.buyer_id),
			to: r.items.id.through(r.chat_rooms.item_id),
			alias: 'profiles_id_items_id_via_chatRooms',
		}),
		itemsProfileId: r.many.items({
			from: r.profiles.id,
			to: r.items.profile_id,
			alias: 'items_profileId_profiles_id',
		}),
		ordersBuyerId: r.many.orders({
			from: r.profiles.id,
			to: r.orders.buyer_id,
			alias: 'orders_buyerId_profiles_id',
		}),
		ordersSellerId: r.many.orders({
			from: r.profiles.id,
			to: r.orders.seller_id,
			alias: 'orders_sellerId_profiles_id',
		}),
		ordersProposalsProfileId: r.many.orders_proposals({
			from: r.profiles.id,
			to: r.orders_proposals.profile_id,
			alias: 'ordersProposals_profileId_profiles_id',
		}),
		user: r.one.users({
			from: r.profiles.user_id,
			to: r.users.id,
		}),
		itemsViaUserItemsFavorites: r.many.items({
			from: r.profiles.id.through(r.profiles_items_favorites.profile_id),
			to: r.items.id.through(r.profiles_items_favorites.item_id),
			alias: 'items_id_profiles_id_via_userItemsFavorites',
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
	properties: {
		propertyValues: r.many.property_values({
			from: r.properties.id,
			to: r.property_values.property_id,
		}),
		subcategories: r.many.subcategories({
			from: r.properties.id.through(r.subcategory_properties.property_id),
			to: r.subcategories.id.through(r.subcategory_properties.subcategory_id),
		}),
	},
	property_values: {
		items: r.many.items({
			from: r.property_values.id.through(r.items_properties_values.property_value_id),
			to: r.items.id.through(r.items_properties_values.item_id),
		}),
		property: r.one.properties({
			from: r.property_values.property_id,
			to: r.properties.id,
		}),
	},
	refreshTokens: {
		user: r.one.users({
			from: r.refreshTokens.username,
			to: r.users.username,
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
			alias: 'subRegions_regionId_regions_id',
		}),
		subRegionsViaCountries: r.many.subRegions({
			from: r.regions.id.through(r.countries.region_id),
			to: r.subRegions.id.through(r.countries.subregion_id),
			alias: 'regions_id_subRegions_id_via_countries',
		}),
	},
	shippings: {
		item: r.one.items({
			from: r.shippings.item_id,
			to: r.items.id,
			alias: 'shippings_itemId_items_id',
		}),
		order: r.one.orders({
			from: r.shippings.order_id,
			to: r.orders.id,
		}),
	},
	shipping_label_purchases: {
		item: r.one.items({
			from: r.shipping_label_purchases.item_id,
			to: r.items.id,
		}),
		order: r.one.orders({
			from: r.shipping_label_purchases.order_id,
			to: r.orders.id,
		}),
	},
	states: {
		countries: r.many.countries({
			from: r.states.id.through(r.cities.state_id),
			to: r.countries.id.through(r.cities.country_id),
			alias: 'countries_id_states_id_via_cities',
		}),
		country: r.one.countries({
			from: r.states.country_id,
			to: r.countries.id,
			alias: 'states_countryId_countries_id',
		}),
		cities: r.many.cities({
			from: r.states.id,
			to: r.cities.state_id,
		}),
	},
	subRegions: {
		regions: r.many.regions({
			from: r.subRegions.id.through(r.countries.subregion_id),
			to: r.regions.id.through(r.countries.region_id),
			alias: 'regions_id_subRegions_id_via_countries',
		}),
		region: r.one.regions({
			from: r.subRegions.region_id,
			to: r.regions.id,
			alias: 'subRegions_regionId_regions_id',
		}),
		countries: r.many.countries({
			from: r.subRegions.id,
			to: r.countries.subregion_id,
		}),
	},
	subcategories: {
		categories: r.many.categories({
			from: r.subcategories.id.through(r.subcategories.parent_id),
			to: r.categories.id.through(r.subcategories.category_id),
			alias: 'categories_id_subcategories_id_via_subcategories',
		}),
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
		properties: r.many.properties({
			from: r.subcategories.id.through(r.subcategory_properties.subcategory_id),
			to: r.properties.id.through(r.subcategory_properties.property_id),
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
		profile: r.one.profiles({
			from: r.users.id,
			to: r.profiles.user_id,
		}),
		refreshTokens: r.many.refreshTokens({
			from: r.users.username,
			to: r.refreshTokens.username,
		}),
	},
}));
