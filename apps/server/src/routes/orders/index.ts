import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { createClient } from '#database/index';
import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import {
	items,
	users,
	orders,
	profiles,
	addresses,
	cities,
	orders_proposals,
	shippings,
	entityTrustapTransactions,
} from '#db-schema';
import { authPath, environment } from '#utils/constants';
import { ORDER_PHASES } from '#database/schemas/enumerated_values';
import { entityPlatformTransactions } from '#database/schemas/entity_platform_transactions';

export const ordersRoute = createRouter()
	.get(`${authPath}/purchased/:status`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { status } = c.req.param();

		const { db } = createClient();

		const cityAlias = alias(cities, 'city');
		const provinceAlias = alias(cities, 'province');

		// Build where conditions dynamically
		const whereConditions = [eq(orders.buyer_id, user.profile_id)];

		// Add status filter if not 'all' and not undefined
		if (status !== 'all' && status) {
			whereConditions.push(eq(orders.status, status));
		}

		const userOrders = await db
			.select({
				orders: {
					id: orders.id,
					status: orders.status,
					shipping_price: shippings.sp_price,
					payment_provider_charge: entityTrustapTransactions.charge,
					platform_charge: entityPlatformTransactions.charge,
					payment_transaction_id: entityTrustapTransactions.transactionId,
					sp_shipment_id: shippings.sp_shipment_id,
					created_at: orders.created_at,
					updated_at: orders.updated_at,
				},
				items: {
					id: items.id,
					title: items.title,
					price: items.price,
				},
				orders_proposals: {
					id: orders_proposals.id,
					proposal_price: orders_proposals.proposal_price,
				},
				seller: {
					id: users.id,
					username: users.username,
				},
				buyer: {
					payment_provider_id_full: profiles.payment_provider_id_full,
					street_address: addresses.street_address,
					civic_number: addresses.civic_number,
					city_id: addresses.city_id,
					province_id: addresses.province_id,
					postal_code: addresses.postal_code,
					city: cityAlias.name,
					province: provinceAlias.name,
					country_code: addresses.country_code,
				},
			})
			.from(orders)
			.innerJoin(items, eq(orders.item_id, items.id))
			.leftJoin(orders_proposals, eq(orders_proposals.id, orders.proposal_id))
			.innerJoin(profiles, eq(profiles.id, orders.buyer_id))
			.innerJoin(users, eq(users.id, profiles.user_id))
			.innerJoin(addresses, eq(addresses.id, orders.seller_address))
			.innerJoin(cityAlias, eq(cityAlias.id, addresses.city_id))
			.innerJoin(provinceAlias, eq(provinceAlias.id, addresses.province_id))
			.innerJoin(shippings, eq(shippings.order_id, orders.id))
			.innerJoin(entityPlatformTransactions, eq(entityPlatformTransactions.entityId, orders.id))
			.innerJoin(entityTrustapTransactions, eq(entityTrustapTransactions.entityId, orders.id))
			.where(and(...whereConditions));

		if (!userOrders.length) {
			return c.json([], 200);
		}

		const orderList = userOrders.map((order) => {
			const id = order.orders.id;
			const { status, shipping_price, payment_provider_charge, platform_charge, sp_shipment_id, created_at } =
				order.orders;

			const payment_url = `${environment.PAYMENT_PROVIDER_PAY_PAGE_URL}/${order.orders.payment_transaction_id}/${order.buyer.payment_provider_id_full ? 'pay' : 'guest_pay'}?redirect_uri=${environment.PP_POST_PAYMENT_REDIRECT_URL}/auth/profile/orders?highlight=${order.orders.id}`;

			const order_shape = {
				id,
				status: status as (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES],
				original_price: order.items.price,
				payment_provider_charge,
				platform_charge,
				shipping_price,
				sp_shipment_id,
				item: {
					id: order.items.id,
					title: order.items.title,
				},
				proposal: {
					id: order.orders_proposals?.id,
					price: order.orders_proposals?.proposal_price,
				},
				seller: {
					id: order.seller.id,
					username: order.seller.username,
				},
				buyer: {
					street_address: order.buyer.street_address,
					civic_number: order.buyer.civic_number,
					city: order.buyer.city,
					province: order.buyer.province,
					postal_code: order.buyer.postal_code,
					country_code: order.buyer.country_code,
					payment_url,
				},
				updated_at: order.orders.updated_at,
				created_at,
			};

			console.log('order_shape', order_shape);

			return order_shape;
		});

		return c.json(orderList, 200);
	})
	.get(`${authPath}/sold/:status`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { status } = c.req.param();

		const { db } = createClient();

		const cityAlias = alias(cities, 'city');
		const provinceAlias = alias(cities, 'province');

		// Build where conditions dynamically
		const whereConditions = [eq(orders.seller_id, user.profile_id), eq(items.status, 'sold')];

		// Add status filter if not 'all' and not undefined
		if (status !== 'all' && status) {
			whereConditions.push(eq(orders.status, status));
		}

		const userOrders = await db
			.select({
				orders: {
					id: orders.id,
					status: orders.status,
					shipping_price: shippings.sp_price,
					payment_provider_charge: entityTrustapTransactions.charge,
					platform_charge: entityPlatformTransactions.charge,
					payment_transaction_id: entityTrustapTransactions.transactionId,
					sp_shipment_id: shippings.sp_shipment_id,
					created_at: orders.created_at,
					updated_at: orders.updated_at,
				},
				items: {
					id: items.id,
					title: items.title,
					price: items.price,
				},
				orders_proposals: {
					id: orders_proposals.id,
					proposal_price: orders_proposals.proposal_price,
				},
				seller: {
					id: users.id,
					username: users.username,
				},
				buyer: {
					payment_provider_id_full: profiles.payment_provider_id_full,
					street_address: addresses.street_address,
					civic_number: addresses.civic_number,
					city_id: addresses.city_id,
					province_id: addresses.province_id,
					postal_code: addresses.postal_code,
					city: cityAlias.name,
					province: provinceAlias.name,
					country_code: addresses.country_code,
				},
			})
			.from(orders)
			.innerJoin(items, eq(orders.item_id, items.id))
			.leftJoin(orders_proposals, eq(orders_proposals.id, orders.proposal_id))
			.innerJoin(profiles, eq(profiles.id, orders.buyer_id))
			.innerJoin(users, eq(users.id, profiles.user_id))
			.innerJoin(addresses, eq(addresses.id, orders.seller_address))
			.innerJoin(cityAlias, eq(cityAlias.id, addresses.city_id))
			.innerJoin(provinceAlias, eq(provinceAlias.id, addresses.province_id))
			.innerJoin(shippings, eq(shippings.order_id, orders.id))
			.innerJoin(entityPlatformTransactions, eq(entityPlatformTransactions.entityId, orders.id))
			.innerJoin(entityTrustapTransactions, eq(entityTrustapTransactions.entityId, orders.id))
			.where(and(...whereConditions));

		if (!userOrders.length) {
			return c.json([], 200);
		}

		const orderList = userOrders.map((order) => {
			const id = order.orders.id;
			const { status, shipping_price, payment_provider_charge, platform_charge, sp_shipment_id, created_at } =
				order.orders;

			const payment_url = `${environment.PAYMENT_PROVIDER_PAY_PAGE_URL}/${order.orders.payment_transaction_id}/${order.buyer.payment_provider_id_full ? 'pay' : 'guest_pay'}?redirect_uri=${environment.PP_POST_PAYMENT_REDIRECT_URL}/auth/profile/orders?highlight=${order.orders.id}`;

			const order_shape = {
				id,
				status: status as (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES],
				original_price: order.items.price,
				payment_provider_charge,
				platform_charge,
				shipping_price,
				sp_shipment_id,
				item: {
					id: order.items.id,
					title: order.items.title,
				},
				proposal: {
					id: order.orders_proposals?.id,
					price: order.orders_proposals?.proposal_price,
				},
				seller: {
					id: order.seller.id,
					username: order.seller.username,
				},
				buyer: {
					street_address: order.buyer.street_address,
					civic_number: order.buyer.civic_number,
					city: order.buyer.city,
					province: order.buyer.province,
					postal_code: order.buyer.postal_code,
					country_code: order.buyer.country_code,
					payment_url,
				},
				updated_at: order.orders.updated_at,
				created_at,
			};

			return order_shape;
		});

		return c.json(orderList, 200);
	})
	.get(`${authPath}/:id`, authMiddleware, async (c) => {
		const { db } = createClient();

		const { id } = c.req.param();

		const [order] = await db
			.select()
			.from(orders)
			.where(eq(orders.id, Number(id)));

		if (!order) return c.json({ error: 'Order not found' }, 404);

		return c.json(order);
	});
