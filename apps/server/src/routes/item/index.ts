import { eq, and, not, desc, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { env } from 'hono/adapter';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';

import { createClient } from '#database/index';
import {
	subcategories,
	subcategory_properties,
	items,
	cities,
	users,
	addresses,
	items_images,
	property_values,
	profiles,
	entityTrustapTransactions,
	orders,
	orders_proposals,
	shippings,
} from '#db-schema';
import { items_properties_values, InsertItemPropertyValue } from '#database/schemas/items_properties_values';
import { createRouter } from '#lib/create-app';
import { authPath } from '#utils/constants';
import { createItemSchema } from '#extended_schemas';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { itemDetailResponseType } from '#extended_schemas';
import {
	addressStatus,
	itemStatus,
	newOrderBlockedStates,
	ORDER_PROPOSAL_PHASES,
} from '#database/schemas/enumerated_values';
import { calculatePlatformCosts } from '#utils/platform-costs';
import { ORDER_PHASES } from '#utils/order-phases';
import { environment } from '#utils/constants';
import { formatPriceToCents } from '#utils/price-formatter';
import { sendBuyNowOrderCreatedBuyer } from '#mailer/templates/orders/buyer/buy-now-order-created-buyer';

import { ShipmentService } from '../shipment-provider/shipment.service';
import { PaymentProviderService } from '../payments/payment-provider.service';
import { entityPlatformTransactions } from '#database/schemas/entity_platform_transactions';

export const itemRoute = createRouter()
	// Get item route
	// This endpoint can be consumed by both logged and guest users
	.get('/:id', async (c) => {
		const { ACCESS_TOKEN_SECRET } = env<{
			ACCESS_TOKEN_SECRET: string;
		}>(c);

		const id = Number(c.req.param('id'));

		if (!id) return c.json({ error: 'item id is required' }, 400);
		if (isNaN(id)) return c.json({ message: 'Invalid item ID' }, 400);

		const access_token = getCookie(c, 'access_token');

		let payload;

		if (access_token) payload = await verify(access_token, ACCESS_TOKEN_SECRET);

		// If user is logged in, we can get the user_profile_id from the payload and use it to filter the data for the logged user
		const user_profile_id = Number(payload?.profile_id);

		const { db } = createClient();

		const city = alias(cities, 'city');
		const province = alias(cities, 'province');

		try {
			// Get basic item data
			const [item] = await db
				.select({
					id: items.id,
					profile_id: profiles.id,
					username: users.username,
					title: items.title,
					price: items.price,
					description: items.description,
					city_id: city.id,
					city_name: city.name,
					province_id: province.id,
					province_name: province.name,
					easy_pay: items.easy_pay,
					subcategory_name: subcategories.name,
					subcategory_slug: subcategories.slug,
				})
				.from(items)
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.innerJoin(addresses, eq(addresses.id, items.address_id))
				.innerJoin(city, eq(city.id, addresses.city_id))
				.innerJoin(province, eq(province.id, addresses.province_id))
				.innerJoin(profiles, eq(profiles.id, items.profile_id))
				.innerJoin(users, eq(users.id, profiles.user_id))
				.where(and(eq(items.id, id), eq(items.published, true)))
				.limit(1);

			if (!item) throw new Error('No item found');

			// Get all properties for this item
			const itemProperties = await db
				.select({
					name: property_values.name,
					value: property_values.value,
					boolean_value: property_values.boolean_value,
					numeric_value: property_values.numeric_value,
				})
				.from(items_properties_values)
				.innerJoin(property_values, eq(items_properties_values.property_value_id, property_values.id))
				.where(eq(items_properties_values.item_id, id));

			// Get latest pending proposal (only if user is logged in)
			let latestPendingProposal = null;
			if (user_profile_id && !isNaN(user_profile_id)) {
				const [proposal] = await db
					.select({
						id: orders_proposals.id,
						status: orders_proposals.status,
						created_at: orders_proposals.created_at,
					})
					.from(orders_proposals)
					.where(
						and(
							eq(orders_proposals.item_id, id),
							eq(orders_proposals.profile_id, user_profile_id),
							eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
						),
					)
					.orderBy(desc(orders_proposals.created_at))
					.limit(1);
				latestPendingProposal = proposal;
			}

			// Get latest payment_pending order (only if user is logged in)
			let latestPaymentPendingOrder = null;
			if (user_profile_id && !isNaN(user_profile_id)) {
				const [order] = await db
					.select({
						id: orders.id,
						status: orders.status,
					})
					.from(orders)
					.where(
						and(
							eq(orders.item_id, id),
							eq(orders.buyer_id, user_profile_id),
							eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
						),
					)
					.orderBy(desc(orders.created_at))
					.limit(1);
				latestPaymentPendingOrder = order;
			}

			const itemImages = await db
				.select({ url: items_images.url })
				.from(items_images)
				.where(and(eq(items_images.item_id, id), eq(items_images.size, 'original')));

			const mergedItem: itemDetailResponseType = {
				id: item.id,
				user: {
					id: item.profile_id,
					username: item.username,
				},
				title: item.title,
				price: item.price,
				description: item.description,
				order: {
					id: latestPaymentPendingOrder?.id || null,
					status: latestPaymentPendingOrder?.status || undefined,
				},
				orderProposal: {
					id: latestPendingProposal?.id || null,
					created_at: latestPendingProposal?.created_at?.toISOString() || undefined,
					status: latestPendingProposal?.status || undefined,
				},
				location: {
					city: {
						id: item.city_id,
						name: item.city_name,
					},
					province: {
						id: item.province_id,
						name: item.province_name,
					},
				},
				easy_pay: item.easy_pay,
				subcategory: {
					name: item.subcategory_name,
					slug: item.subcategory_slug,
				},
				properties: itemProperties,
				images: itemImages.map((item) => item.url),
			};

			return c.json(mergedItem, 200);
		} catch (error) {
			console.log(error);
			return c.json({ message: 'Get item error' }, 500);
		}
	})
	// Create item route
	.post(`/${authPath}/new`, authMiddleware, zValidator('json', createItemSchema), async (c) => {
		try {
			const user = c.var.user;

			const { commons, properties, shipping } = c.req.valid('json');

			const hasDeliveryMethod = properties?.find((p) => p.slug === 'delivery_method');

			// if property value delivery_method is "shipping" and shipping_price is not provided, return error
			if (hasDeliveryMethod && hasDeliveryMethod.value === 'shipping' && !shipping?.shipping_price) {
				return c.json({ message: 'Shipping price is required' }, 400);
			}

			// if property value delivery_method is "pickup" and shipping_price is provided, return error
			if (hasDeliveryMethod && hasDeliveryMethod.value === 'pickup' && shipping?.shipping_price) {
				return c.json({ message: 'Shipping price is not allowed' }, 400);
			}

			const { db } = createClient();

			// Check if the subcategory exists
			const availableSubcategory = await db
				.select()
				.from(subcategories)
				.where(eq(subcategories.id, commons.subcategory_id))
				.limit(1)
				.then((results) => results[0]);

			if (!availableSubcategory) {
				return c.json(
					{
						message: `Subcategory with ID ${commons.subcategory_id} doesn't exist`,
					},
					400,
				);
			}

			/* TODO: CHECK WITH AI IF COMMONS VALUES CONTAINS MATURE OR POTENTIAL INAPPROPRIATE CONTENT */

			return await db.transaction(async (tx) => {
				// get the profile id of the logged user
				const [profile] = await tx
					.select({
						name: profiles.name,
						surname: profiles.surname,
						payment_provider_id_guest: profiles.payment_provider_id_guest,
						payment_provider_id_full: profiles.payment_provider_id_full,
					})
					.from(profiles)
					.where(eq(profiles.id, user.profile_id))
					.limit(1);

				if (!profile) return c.json({ message: 'Profile not found' }, 404);

				// If item has easyPay flag and the user has no payment_provider_id_guest, we need to create a new one
				if (commons.easy_pay && !profile.payment_provider_id_guest) {
					// get the active address from the user
					const [address] = await tx
						.select({ country_code: addresses.country_code })
						.from(addresses)
						.where(eq(addresses.status, 'active'))
						.limit(1);

					if (!address) return c.json({ message: 'Address not found' }, 404);

					// create a new payment provider guest user
					const paymentProviderService = new PaymentProviderService();

					const paymentProviderId = await paymentProviderService.createGuestUser({
						id: user.profile_id,
						email: user.email,
						first_name: profile.name,
						last_name: profile.surname,
						country_code: address.country_code,
						tos_acceptance: {
							unix_timestamp: Math.floor(new Date().getTime() / 1000),
							ip: c.req.raw.headers.get('x-forwarded-for') || '127.0.0.1',
						},
					});

					if (!paymentProviderId) return c.json({ message: 'Failed to create payment provider guest user' }, 500);

					await tx
						.update(profiles)
						.set({ payment_provider_id_guest: paymentProviderId.id })
						.where(eq(profiles.id, user.profile_id));
				}

				// Check if delivery_method is "pickup"
				const isPickup = properties?.some((p) => p.slug === 'delivery_method' && p.value === 'pickup');

				// Create the new item
				const [newItem] = await tx
					.insert(items)
					.values({
						...commons,
						profile_id: user.profile_id,
						status: itemStatus.AVAILABLE,
						...(hasDeliveryMethod && !isPickup && shipping
							? {
									custom_shipping_price: shipping?.shipping_price,
									item_weight: shipping?.item_weight,
									item_length: shipping?.item_length,
									item_width: shipping?.item_width,
									item_height: shipping?.item_height,
								}
							: {}),
						published: true,
					})
					.returning();

				if (!newItem?.id) {
					throw new Error('Failed to create item');
				}

				// TODO: CONVERT PROPERTY VALUES TO NUMBERS

				// Handle item properties(properties) if provided
				if (properties?.length) {
					// Get valid properties for this subcategory
					const subcategoryProperties = await tx
						.select()
						.from(subcategory_properties)
						.where(eq(subcategory_properties.subcategory_id, commons.subcategory_id));

					const validPropertyIds = new Set(subcategoryProperties.map((p) => p.property_id));

					// Validate all properties exist
					const invalidProperties = properties.filter((p) => !validPropertyIds.has(p.id));

					if (invalidProperties.length) {
						throw new Error('Some properties have invalid property IDs');
					}

					const reshapedProperties: InsertItemPropertyValue[] = [];

					// Reshape properties to match the database schema
					properties.map((p) => {
						// Check if the property contains an array of values
						// If so, map through the values and create an object for each
						// Otherwise, create a single object
						if (Array.isArray(p.value)) {
							p.value.map((v) => {
								reshapedProperties.push({
									item_id: newItem.id,
									property_value_id: Number(v),
								});
							});
						} else {
							reshapedProperties.push({
								item_id: newItem.id,
								property_value_id: Number(p.value),
							});
						}
					});

					// Insert property values
					await tx.insert(items_properties_values).values(reshapedProperties);
				} else {
					// Check if the selected subcategory has mandatory properties
					const mandatoryProperties = await tx
						.select()
						.from(subcategory_properties)
						.where(
							and(
								eq(subcategory_properties.subcategory_id, commons.subcategory_id),
								eq(subcategory_properties.on_item_create_required, true),
							),
						);

					if (mandatoryProperties.length > 0) {
						throw new Error(`This subcategory requires ${mandatoryProperties.length} mandatory properties`);
					}
				}

				// Return the created item
				return c.json(
					{
						message: 'Item created successfully',
						item_id: newItem.id,
					},
					201,
				);
			});
		} catch (error) {
			console.error('Error creating item:', error);
			return c.json(
				{
					message: error instanceof Error ? error.message : 'Failed to create item',
				},
				400,
			);
		}
	})
	// Edit item route
	.put(`/${authPath}/edit/:id`, authMiddleware, async (c) => {
		return c.json({});
	})
	// Buy now route
	.post(
		`/${authPath}/buy_now`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				item_id: z.number(),
				shipping_id: z.string(),
				shipping_rate_id: z.string(),
			}),
		),
		async (c) => {
			const user = c.var.user;

			const { item_id, shipping_id, shipping_rate_id } = c.req.valid('json');

			const { db } = createClient();

			try {
				return await db.transaction(async (tx) => {
					//  Validate item availability and get seller info
					const [item] = await tx
						.select({
							id: items.id,
							title: items.title,
							profile_id: items.profile_id,
							price: items.price,
							status: items.status,
							published: items.published,
							payment_provider_id_guest: profiles.payment_provider_id_guest,
							payment_provider_id_full: profiles.payment_provider_id_full,
							seller_address_id: items.address_id,
							seller_username: users.username,
						})
						.from(items)
						.innerJoin(profiles, eq(profiles.id, items.profile_id))
						.innerJoin(users, eq(users.id, profiles.user_id))
						.where(and(eq(items.id, item_id), eq(items.status, itemStatus.AVAILABLE), eq(items.published, true)))
						.limit(1);

					if (!item) {
						return c.json({ error: 'Item not available' }, 400);
					}

					const seller_pp_id_guest = item.payment_provider_id_guest;
					const seller_pp_id_full = item.payment_provider_id_full;

					if (!seller_pp_id_guest && !seller_pp_id_full) {
						return c.json({ error: 'Seller has no payment provider id' }, 400);
					}

					/* Protection against multiple orders for the same item in specific states.
					 */

					// Check if user has placed already an order for this item
					const [userHasAnOrder] = await tx
						.select({ id: orders.id })
						.from(orders)
						.where(
							and(
								eq(orders.item_id, item_id),
								eq(orders.buyer_id, user.profile_id),
								inArray(orders.status, newOrderBlockedStates),
							),
						)
						.limit(1);

					if (userHasAnOrder) {
						return c.json({ error: 'You have already placed an order for this item' }, 400);
					}

					// Check if an order already exists in a different status than PAYMENT_PENDING
					const [existingOrders] = await tx
						.select({ id: orders.id })
						.from(orders)
						.where(and(eq(orders.item_id, item_id), not(eq(orders.status, ORDER_PHASES.PAYMENT_PENDING))))
						.limit(1);

					if (existingOrders) {
						return c.json({ error: 'An order already exists for this item' }, 400);
					}

					// Get buyer payment provider id
					const [buyerInfo] = await tx
						.select({
							payment_provider_id_guest: profiles.payment_provider_id_guest,
							payment_provider_id_full: profiles.payment_provider_id_full,
							address_id: addresses.id,
							email: users.email,
							name: profiles.name,
							surname: profiles.surname,
							country_code: addresses.country_code,
						})
						.from(profiles)
						.innerJoin(
							addresses,
							and(eq(profiles.id, addresses.profile_id), eq(addresses.status, addressStatus.ACTIVE)),
						)
						.innerJoin(users, eq(users.id, profiles.user_id))
						.where(eq(profiles.id, user.profile_id))
						.limit(1);

					if (!buyerInfo) {
						return c.json({ error: 'Buyer information not found' }, 404);
					}

					let buyer_pp_id_guest = buyerInfo?.payment_provider_id_guest || null;
					let buyer_pp_id_full = buyerInfo?.payment_provider_id_full || null;

					if (!buyer_pp_id_guest && !buyer_pp_id_full) {
						return c.json({ error: 'Buyer has no payment provider id' }, 404);
					}

					// Create a new payment provider guest user (buyer) if he has no payment_provider_id_guest
					if (!buyer_pp_id_guest) {
						const paymentService = new PaymentProviderService();
						const guestUser = await paymentService.createGuestUser({
							id: user.id,
							email: user.email,
							first_name: buyerInfo.name,
							last_name: buyerInfo.surname,
							country_code: buyerInfo.country_code,
							tos_acceptance: {
								unix_timestamp: Math.floor(new Date().getTime() / 1000),
								ip: c.req.raw.headers.get('x-forwarded-for') || '127.0.0.1',
							},
						});

						if (!guestUser) {
							throw new Error('Failed to create buyer guest user');
						}

						// Update the profile with the payment provider ID
						await tx
							.update(profiles)
							.set({ payment_provider_id_guest: guestUser.id })
							.where(eq(profiles.id, user.profile_id));

						buyer_pp_id_guest = guestUser.id;
					}

					// Check if this shipping_id is valid
					const shipmentService = new ShipmentService();
					const retrivedShipment = await shipmentService.getShipment(shipping_id);

					if (!retrivedShipment) {
						return c.json({ error: 'Invalid shipping id' }, 400);
					}

					const selectedShipmentRate = retrivedShipment.rates.find((rate) => rate.objectId === shipping_rate_id);

					if (!selectedShipmentRate) {
						return c.json({ error: 'Failed to get the shipping rate or shipping price' }, 500);
					}

					const shipping_price = selectedShipmentRate?.amount
						? formatPriceToCents(parseFloat(selectedShipmentRate.amount))
						: 0;

					// Calculate platform charge amount
					const { platform_charge_amount } = await calculatePlatformCosts(
						{ price: item.price },
						{ platform_charge_amount: true },
					);

					if (!platform_charge_amount) {
						return c.json({ error: 'Failed to calculate platform charge amount' }, 500);
					}

					// Total price to pay for the transaction
					const transactionPreviewPrice = item.price + platform_charge_amount;

					// Calculate payment provider charge
					const { payment_provider_charge, payment_provider_charge_calculator_version } = await calculatePlatformCosts(
						{
							price: transactionPreviewPrice,
							postage_fee: shipping_price,
						},
						{
							payment_provider_charge: true,
						},
					);

					if (!payment_provider_charge || !payment_provider_charge_calculator_version) {
						return c.json({ error: 'Failed to calculate payment provider charge' }, 500);
					}

					const paymentProviderService = new PaymentProviderService();

					const transaction = await paymentProviderService.createTransactionWithBothUsers({
						buyer_id: buyer_pp_id_full || buyer_pp_id_guest || '',
						seller_id: seller_pp_id_full || seller_pp_id_guest || '',
						creator_role: 'buyer',
						currency: 'eur',
						description: `Transaction for ${item.title} - (Buy Now)`,
						price: transactionPreviewPrice,
						postage_fee: shipping_price,
						charge: payment_provider_charge,
						charge_calculator_version: payment_provider_charge_calculator_version,
					});

					if (!transaction) {
						return c.json({ error: 'Failed to create Trustap transaction' }, 500);
					}

					// Create new order
					const [newOrder] = await tx
						.insert(orders)
						.values({
							item_id,
							buyer_id: user.profile_id,
							buyer_address: buyerInfo.address_id,
							seller_id: item.profile_id,
							seller_address: item.seller_address_id,
						})
						.returning();

					if (!newOrder) {
						return c.json({ error: 'Failed to create order' }, 500);
					}

					// Store initial Shipping data
					await tx.insert(shippings).values({
						order_id: newOrder.id,
						sp_shipment_id: shipping_id,
						sp_rate_id: selectedShipmentRate.objectId,
						sp_price: shipping_price,
					});

					// Store Platform charges
					await tx.insert(entityPlatformTransactions).values({
						entityId: newOrder.id,
						charge: platform_charge_amount!,
					});

					// Store transaction details
					const [trustapTransaction] = await tx
						.insert(entityTrustapTransactions)
						.values({
							entityId: newOrder.id,
							sellerId: transaction.seller_id,
							buyerId: transaction.buyer_id,
							transactionId: transaction.id,
							transactionType: 'online_payment',
							status: transaction.status,
							price: transaction.price,
							charge: transaction.charge,
							chargeSeller: transaction.charge_seller || 0,
							currency: 'eur',
							entityTitle: item.title,
							claimedBySeller: false,
							claimedByBuyer: false,
							complaintPeriodDeadline: null, // Will be set by webhook
						})
						.returning();

					if (!trustapTransaction) {
						return c.json({ error: 'Failed to store Trustap transaction' }, 500);
					}

					// send email to the buyer
					await sendBuyNowOrderCreatedBuyer({
						to: buyerInfo.email,
						seller_username: item.seller_username,
						itemName: item.title,
					});

					return c.json(
						{
							success: true,
							order: { id: newOrder.id, status: newOrder.status },
							// Return payment URL
							payment_url: `${environment.PAYMENT_PROVIDER_PAY_PAGE_URL}/${transaction.id}/${buyer_pp_id_full ? 'pay' : 'guest_pay'}?redirect_uri=${environment.PP_POST_PAYMENT_REDIRECT_URL}/api/pp-payment-callback?highlight=${newOrder.id}`,
							message: 'Order created, complete the payment for the next step',
						},
						200,
					);
				});
			} catch (error) {
				console.error('Buy now error:', error);
				return c.json({ success: false, error: 'Failed to process purchase' }, 500);
			}
		},
	)
	// User (seller) Delete item route
	.post(
		`/${authPath}/user_delete_item`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				id: z.number(),
			}),
		),
		async (c) => {
			const { ACCESS_TOKEN_SECRET } = env<{
				ACCESS_TOKEN_SECRET: string;
			}>(c);

			const { id } = c.req.valid('json');

			const accessToken = getCookie(c, 'access_token');
			let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
			const user_id = Number(payload.id);

			if (!user_id) return c.json({ message: 'Invalid user id' }, 401);

			const { db } = createClient();

			try {
				await db.transaction(async (tx) => {
					// First check if the item exists and belongs to the user
					const itemExists = await tx
						.select({ id: items.id })
						.from(items)
						.innerJoin(profiles, eq(profiles.id, items.profile_id))
						.where(and(eq(items.id, id), eq(profiles.user_id, user_id)))
						.limit(1)
						.then((results) => results[0]);

					if (!itemExists) {
						return c.json(
							{
								message: "Item not found or you don't have permission to delete it",
							},
							404,
						);
					}

					// unpublish and set user_deleted:true item
					const [updatedItem] = await db
						.update(items)
						.set({
							published: false,
							deleted_at: new Date(),
						})
						.where(eq(items.id, id))
						.returning();

					if (!updatedItem?.id) {
						return c.json(
							{
								message: `Item ${id} cant be deleted because doesn't exist.`,
								id,
							},
							401,
						);
					}
				});

				return c.json(
					{
						message: 'Item deleted successfully',
						id,
					},
					200,
				);
			} catch (error) {
				return c.json(
					{
						message: error instanceof Error ? error.message : `Failed to delete item ${id}`,
					},
					500,
				);
			}
		},
	)
	// User (seller) Publish/Unpublish item route
	.post(
		`/${authPath}/publish_state`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				id: z.number(),
				published: z.boolean(),
			}),
		),
		async (c) => {
			const { ACCESS_TOKEN_SECRET } = env<{
				ACCESS_TOKEN_SECRET: string;
			}>(c);

			const { id, published } = c.req.valid('json');

			const accessToken = getCookie(c, 'access_token');
			let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
			const profile_id = Number(payload.profile_id);

			if (!profile_id) return c.json({ message: 'Invalid profile id' }, 401);

			const { db } = createClient();
			try {
				await db.transaction(async (tx) => {
					// First check if the item exists and belongs to the user
					const itemExists = await tx
						.select({ id: items.id })
						.from(items)
						.innerJoin(profiles, eq(profiles.id, items.profile_id))
						.where(and(eq(items.id, id), eq(profiles.id, profile_id)))
						.limit(1)
						.then((results) => results[0]);

					if (!itemExists) {
						return c.json(
							{
								message: "Item not found or you don't have permission to change the publish state",
							},
							404,
						);
					}

					// unpublish item
					const [updatedItem] = await db
						.update(items)
						.set({
							published,
						})
						.where(eq(items.id, id))
						.returning();

					if (!updatedItem?.id) {
						return c.json(
							{
								message: `Item ${id} cant be changed the publish state because doesn't exist.`,
								id,
							},
							401,
						);
					}
				});

				return c.json(
					{
						message: 'Item publish state changed successfully',
						id,
					},
					200,
				);
			} catch (error) {
				return c.json(
					{
						message: error instanceof Error ? error.message : `Failed to change the publish state of item ${id}`,
					},
					500,
				);
			}
		},
	);
