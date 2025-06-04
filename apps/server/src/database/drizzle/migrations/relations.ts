import { relations } from 'drizzle-orm/relations';
import { items, chatRooms, users, profiles, addresses, cities, states, chatMessages, ordersProposals } from './schema';

export const chatRoomsRelations = relations(chatRooms, ({ one, many }) => ({
	item: one(items, {
		fields: [chatRooms.itemId],
		references: [items.id],
	}),
	user: one(users, {
		fields: [chatRooms.buyerId],
		references: [users.id],
	}),
	chatMessages: many(chatMessages),
}));

export const itemsRelations = relations(items, ({ many }) => ({
	chatRooms: many(chatRooms),
}));

export const usersRelations = relations(users, ({ many }) => ({
	chatRooms: many(chatRooms),
	chatMessages: many(chatMessages),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
	profile: one(profiles, {
		fields: [addresses.profileId],
		references: [profiles.id],
	}),
	city_cityId: one(cities, {
		fields: [addresses.cityId],
		references: [cities.id],
		relationName: 'addresses_cityId_cities_id',
	}),
	city_provinceId: one(cities, {
		fields: [addresses.provinceId],
		references: [cities.id],
		relationName: 'addresses_provinceId_cities_id',
	}),
}));

export const profilesRelations = relations(profiles, ({ many }) => ({
	addresses: many(addresses),
}));

export const citiesRelations = relations(cities, ({ one, many }) => ({
	addresses_cityId: many(addresses, {
		relationName: 'addresses_cityId_cities_id',
	}),
	addresses_provinceId: many(addresses, {
		relationName: 'addresses_provinceId_cities_id',
	}),
	state: one(states, {
		fields: [cities.stateId],
		references: [states.id],
	}),
}));

export const statesRelations = relations(states, ({ many }) => ({
	cities: many(cities),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
	chatRoom: one(chatRooms, {
		fields: [chatMessages.chatRoomId],
		references: [chatRooms.id],
	}),
	user: one(users, {
		fields: [chatMessages.senderId],
		references: [users.id],
	}),
	ordersProposal: one(ordersProposals, {
		fields: [chatMessages.orderProposalId],
		references: [ordersProposals.id],
	}),
}));

export const ordersProposalsRelations = relations(ordersProposals, ({ many }) => ({
	chatMessages: many(chatMessages),
}));
