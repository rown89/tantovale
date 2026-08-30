import { eq, and, not, desc, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { env } from 'hono/adapter';
import { getCookie } from 'hono/cookie';

import { createClient, type DrizzleClient } from '#database/index';
import {
	subcategories,
	subcategory_properties,
	items,
	cities,
	users,
	addresses,
	items_images,
	properties,
	property_values,
	profiles,
	entityTrustapTransactions,
	orders,
	orders_proposals,
} from '#db-schema';
import { items_properties_values } from '#database/schemas/items_properties_values';
import { createRouter } from '#lib/create-app';
import { authPath } from '#utils/constants';
import { createItemSchema, updateItemSchema, type createItemTypes } from '#extended_schemas';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { itemDetailResponseType } from '#extended_schemas';
import {
	addressStatus,
	EntityTrustapTransactionStatus,
	itemStatus,
	newOrderBlockedStates,
	ORDER_PROPOSAL_PHASES,
} from '#database/schemas/enumerated_values';
import { calculatePlatformCosts } from '#utils/platform-costs';
import { ORDER_PHASES } from '#utils/order-phases';
import { environment } from '#utils/constants';
import { formatPriceToCents } from '#utils/price-formatter';
import { sendBuyNowOrderCreatedBuyer } from '#mailer/templates/orders/buyer/buy-now-order-created-buyer';
import { resolveOptionalLiveSessionUser } from '#middlewares/authMiddleware/utils';

import { ShipmentService } from '../shipment-provider/shipment.service';
import { PaymentProviderService } from '../payments/payment-provider.service';

type ItemTransaction = Parameters<Parameters<DrizzleClient['db']['transaction']>[0]>[0];
type ItemProperties = NonNullable<createItemTypes['properties']>;

type ValidatedProperties = {
	deliveryMethod?: string;
	propertyValueIds: number[];
};

async function validatePropertiesForSubcategory(
	tx: ItemTransaction,
	subcategoryId: number,
	itemProperties: ItemProperties | undefined,
): Promise<ValidatedProperties> {
	const mappings = await tx
		.select({
			property_id: subcategory_properties.property_id,
			required: subcategory_properties.on_item_create_required,
			slug: properties.slug,
		})
		.from(subcategory_properties)
		.innerJoin(properties, eq(properties.id, subcategory_properties.property_id))
		.where(eq(subcategory_properties.subcategory_id, subcategoryId));
	const mappingByProperty = new Map(mappings.map((mapping) => [mapping.property_id, mapping]));
	const suppliedPropertyIds = new Set(itemProperties?.map(({ id }) => id) ?? []);

	if (mappings.some((mapping) => mapping.required && !suppliedPropertyIds.has(mapping.property_id))) {
		throw new Error('All required properties must be provided');
	}

	const flattenedSelections =
		itemProperties?.flatMap((property) => {
			const mapping = mappingByProperty.get(property.id);
			if (!mapping || mapping.slug !== property.slug) {
				throw new Error('Some properties are not mapped to this subcategory');
			}

			const values = Array.isArray(property.value) ? property.value : [property.value];
			if (values.length === 0) {
				throw new Error('Property values cannot be empty');
			}

			return values.map((value) => {
				const propertyValueId = Number(value);
				if (!Number.isSafeInteger(propertyValueId) || propertyValueId <= 0) {
					throw new Error('Property values must be positive integer IDs');
				}
				return { propertyId: property.id, propertyValueId, slug: property.slug };
			});
		}) ?? [];
	const uniqueValueIds = [...new Set(flattenedSelections.map(({ propertyValueId }) => propertyValueId))];
	const storedValues = uniqueValueIds.length
		? await tx
				.select({ id: property_values.id, property_id: property_values.property_id, value: property_values.value })
				.from(property_values)
				.where(inArray(property_values.id, uniqueValueIds))
		: [];
	const valueById = new Map(storedValues.map((value) => [value.id, value]));
	let deliveryMethod: string | undefined;

	for (const selection of flattenedSelections) {
		const storedValue = valueById.get(selection.propertyValueId);
		if (!storedValue || storedValue.property_id !== selection.propertyId) {
			throw new Error('Some property values do not belong to the supplied properties');
		}
		if (selection.slug === 'delivery_method') {
			deliveryMethod = storedValue.value ?? undefined;
		}
	}

	return {
		deliveryMethod,
		propertyValueIds: uniqueValueIds,
	};
}

function validateShipping(deliveryMethod: string | undefined, shipping: createItemTypes['shipping']): void {
	if (deliveryMethod === 'pickup') {
		if ((shipping?.shipping_price ?? 0) > 0) {
			throw new Error('Shipping price is not allowed');
		}
		return;
	}

	if (deliveryMethod === 'shipping') {
		const requiredValues = [
			shipping?.shipping_price,
			shipping?.item_weight,
			shipping?.item_length,
			shipping?.item_width,
			shipping?.item_height,
		];
		if (requiredValues.some((value) => typeof value !== 'number' || value <= 0)) {
			throw new Error('Shipping price and dimensions are required');
		}
	}

	if (deliveryMethod === 'shipping_easy_pay') {
		const requiredDimensions = [
			shipping?.item_weight,
			shipping?.item_length,
			shipping?.item_width,
			shipping?.item_height,
		];
		if (requiredDimensions.some((value) => typeof value !== 'number' || value <= 0)) {
			throw new Error('Shipping dimensions are required');
		}
	}
}

export const itemRoute = createRouter()
	// THIS ENDPOINT CAN BE CONSUMED BY BOTH LOGGED AND GUEST USERS
	.get('/:id', async (c) => {
		const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = env<{
			ACCESS_TOKEN_SECRET: string;
			REFRESH_TOKEN_SECRET: string;
		}>(c);

		const id = Number(c.req.param('id'));

		if (!Number.isSafeInteger(id) || id <= 0) return c.json({ message: 'Invalid item ID' }, 400);

		const access_token = getCookie(c, 'access_token');
		const refresh_token = getCookie(c, 'refresh_token');
		const { db } = createClient();
		const optionalUser = await resolveOptionalLiveSessionUser({
			db,
			accessToken: access_token,
			refreshToken: refresh_token,
			accessTokenSecret: ACCESS_TOKEN_SECRET,
			refreshTokenSecret: REFRESH_TOKEN_SECRET,
		});

		// A valid optional session can expose only that buyer's private item metadata.
		const user_profile_id = optionalUser?.profile_id;

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
				.where(and(eq(items.id, id), eq(items.published, true), isNull(items.deleted_at)))
				.limit(1);

			if (!item) return c.json({ message: 'Item not found' }, 404);

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
		} catch {
			return c.json({ message: 'Get item error' }, 500);
		}
	})
	.post(`/${authPath}/new`, authMiddleware, zValidator('json', createItemSchema), async (c) => {
		try {
			const user = c.var.user;
			const { commons, properties: requestedProperties, shipping } = c.req.valid('json');
			const { db } = createClient();

			return await db.transaction(async (tx) => {
				const [availableSubcategory] = await tx
					.select({ id: subcategories.id })
					.from(subcategories)
					.where(eq(subcategories.id, commons.subcategory_id))
					.limit(1);
				if (!availableSubcategory) {
					throw new Error(`Subcategory with ID ${commons.subcategory_id} doesn't exist`);
				}

				const [itemAddress] = await tx
					.select({ id: addresses.id })
					.from(addresses)
					.where(and(eq(addresses.id, commons.address_id), eq(addresses.profile_id, user.profile_id)))
					.limit(1);
				if (!itemAddress) throw new Error('Address does not belong to the authenticated profile');

				const validatedProperties = await validatePropertiesForSubcategory(
					tx,
					commons.subcategory_id,
					requestedProperties,
				);
				validateShipping(validatedProperties.deliveryMethod, shipping);

				const [profile] = await tx
					.select({
						name: profiles.name,
						surname: profiles.surname,
						payment_provider_id: profiles.payment_provider_id,
					})
					.from(profiles)
					.where(eq(profiles.id, user.profile_id))
					.limit(1);

				if (!profile) return c.json({ message: 'Profile not found' }, 404);

				if (commons.easy_pay && !profile.payment_provider_id) {
					const [address] = await tx
						.select({ country_code: addresses.country_code })
						.from(addresses)
						.where(and(eq(addresses.profile_id, user.profile_id), eq(addresses.status, addressStatus.ACTIVE)))
						.limit(1);

					if (!address) return c.json({ message: 'Address not found' }, 404);

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
						.set({ payment_provider_id: paymentProviderId.id })
						.where(eq(profiles.id, user.profile_id));
				}

				const [newItem] = await tx
					.insert(items)
					.values({
						...commons,
						profile_id: user.profile_id,
						status: itemStatus.AVAILABLE,
						...(validatedProperties.deliveryMethod !== 'pickup' && shipping
							? {
									custom_shipping_price: shipping.shipping_price,
									item_weight: shipping.item_weight,
									item_length: shipping.item_length,
									item_width: shipping.item_width,
									item_height: shipping.item_height,
								}
							: {}),
						published: true,
					})
					.returning();

				if (!newItem?.id) {
					throw new Error('Failed to create item');
				}

				if (validatedProperties.propertyValueIds.length > 0) {
					await tx.insert(items_properties_values).values(
						validatedProperties.propertyValueIds.map((propertyValueId) => ({
							item_id: newItem.id,
							property_value_id: propertyValueId,
						})),
					);
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
			return c.json(
				{
					message: error instanceof Error ? error.message : 'Failed to create item',
				},
				400,
			);
		}
	})
	.put(`/${authPath}/edit/:id`, authMiddleware, zValidator('json', updateItemSchema), async (c) => {
		const id = Number(c.req.param('id'));
		if (!Number.isSafeInteger(id) || id <= 0) return c.json({ message: 'Invalid item ID' }, 400);

		const user = c.var.user;
		const { commons, properties: requestedProperties, shipping } = c.req.valid('json');
		const hasMutableFields =
			(commons !== undefined && Object.keys(commons).length > 0) ||
			requestedProperties !== undefined ||
			(shipping !== undefined && Object.keys(shipping).length > 0);
		if (!hasMutableFields) return c.json({ message: 'At least one item field is required' }, 400);

		const { db } = createClient();
		try {
			const result = await db.transaction(async (tx) => {
				const [existingItem] = await tx
					.select()
					.from(items)
					.where(and(eq(items.id, id), eq(items.profile_id, user.profile_id), isNull(items.deleted_at)))
					.limit(1);
				if (!existingItem) return undefined;

				if (commons?.address_id !== undefined) {
					const [replacementAddress] = await tx
						.select({ id: addresses.id })
						.from(addresses)
						.where(and(eq(addresses.id, commons.address_id), eq(addresses.profile_id, user.profile_id)))
						.limit(1);
					if (!replacementAddress) throw new Error('Address does not belong to the authenticated profile');
				}

				const targetSubcategoryId = commons?.subcategory_id ?? existingItem.subcategory_id;
				if (commons?.subcategory_id !== undefined) {
					const [subcategory] = await tx
						.select({ id: subcategories.id })
						.from(subcategories)
						.where(eq(subcategories.id, targetSubcategoryId))
						.limit(1);
					if (!subcategory) throw new Error('Subcategory does not exist');
					if (commons.subcategory_id !== existingItem.subcategory_id && requestedProperties === undefined) {
						throw new Error('Properties are required when changing subcategory');
					}
				}

				const validatedProperties =
					requestedProperties === undefined
						? undefined
						: await validatePropertiesForSubcategory(tx, targetSubcategoryId, requestedProperties);
				if (validatedProperties || shipping !== undefined) {
					let deliveryMethod = validatedProperties?.deliveryMethod;
					if (!deliveryMethod) {
						const [storedDelivery] = await tx
							.select({ value: property_values.value })
							.from(items_properties_values)
							.innerJoin(property_values, eq(property_values.id, items_properties_values.property_value_id))
							.innerJoin(properties, eq(properties.id, property_values.property_id))
							.where(and(eq(items_properties_values.item_id, id), eq(properties.slug, 'delivery_method')))
							.limit(1);
						deliveryMethod = storedDelivery?.value ?? undefined;
					}
					const effectiveShipping =
						deliveryMethod === 'pickup'
							? shipping
							: {
									shipping_price: shipping?.shipping_price ?? existingItem.custom_shipping_price ?? undefined,
									item_weight: shipping?.item_weight ?? existingItem.item_weight ?? undefined,
									item_length: shipping?.item_length ?? existingItem.item_length ?? undefined,
									item_width: shipping?.item_width ?? existingItem.item_width ?? undefined,
									item_height: shipping?.item_height ?? existingItem.item_height ?? undefined,
								};
					validateShipping(deliveryMethod, effectiveShipping);
				}

				const updateValues: Partial<typeof items.$inferInsert> = {
					...commons,
					updated_at: new Date(),
					...(shipping === undefined
						? {}
						: {
								custom_shipping_price: shipping.shipping_price,
								item_weight: shipping.item_weight,
								item_length: shipping.item_length,
								item_width: shipping.item_width,
								item_height: shipping.item_height,
							}),
				};
				if (validatedProperties?.deliveryMethod === 'pickup') {
					Object.assign(updateValues, {
						custom_shipping_price: null,
						item_weight: null,
						item_length: null,
						item_width: null,
						item_height: null,
					});
				}

				await tx.update(items).set(updateValues).where(eq(items.id, id));
				if (validatedProperties) {
					await tx.delete(items_properties_values).where(eq(items_properties_values.item_id, id));
					if (validatedProperties.propertyValueIds.length > 0) {
						await tx.insert(items_properties_values).values(
							validatedProperties.propertyValueIds.map((propertyValueId) => ({
								item_id: id,
								property_value_id: propertyValueId,
							})),
						);
					}
				}

				return id;
			});

			if (!result) return c.json({ message: 'Item not found' }, 404);
			return c.json({ message: 'Item updated successfully', item_id: result }, 200);
		} catch (error) {
			return c.json({ message: error instanceof Error ? error.message : 'Failed to update item' }, 400);
		}
	})
	.post(
		`/${authPath}/buy_now`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				item_id: z.number(),
			}),
		),
		async (c) => {
			const user = c.var.user;

			const { item_id } = c.req.valid('json');

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
							payment_provider_id: profiles.payment_provider_id,
							seller_address_id: items.address_id,
							seller_username: users.username,
						})
						.from(items)
						.innerJoin(profiles, eq(profiles.id, items.profile_id))
						.innerJoin(users, eq(users.id, profiles.user_id))
						.where(
							and(
								eq(items.id, item_id),
								eq(items.status, itemStatus.AVAILABLE),
								eq(items.published, true),
								isNull(items.deleted_at),
							),
						)
						.limit(1);

					if (!item || !item.payment_provider_id) {
						return c.json({ error: 'Item not available' }, 400);
					}
					if (item.profile_id === user.profile_id) {
						return c.json({ error: 'You cannot buy your own item' }, 400);
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
							payment_provider_id: profiles.payment_provider_id,
							address_id: addresses.id,
							email: users.email,
						})
						.from(profiles)
						.innerJoin(
							addresses,
							and(eq(profiles.id, addresses.profile_id), eq(addresses.status, addressStatus.ACTIVE)),
						)
						.innerJoin(users, eq(users.id, profiles.user_id))
						.where(eq(profiles.id, user.profile_id))
						.limit(1);

					if (!buyerInfo || !buyerInfo.payment_provider_id) {
						return c.json({ error: 'Buyer information not found or buyer has no payment provider id' }, 404);
					}

					// Create a shipping label
					const shipmentService = new ShipmentService();
					const { rates } = await shipmentService.calculateShippingCostWithRates(item_id, user.profile_id, user.email);
					const labelPreview = rates[0];

					const shipping_label_id = labelPreview?.shipment;
					const shipping_price = labelPreview?.amount ? formatPriceToCents(parseFloat(labelPreview.amount)) : 0;

					if (!labelPreview || !shipping_label_id || !shipping_price) {
						return c.json({ error: 'Failed to generate a label preview' }, 500);
					}

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
						buyer_id: buyerInfo.payment_provider_id,
						seller_id: item.payment_provider_id,
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

					// Store transaction details
					const [trustapTransaction] = await tx
						.insert(entityTrustapTransactions)
						.values({
							entityId: item_id,
							sellerId: transaction.seller_id,
							buyerId: transaction.buyer_id,
							transactionId: transaction.id,
							transactionType: 'online_payment',
							status: transaction.status as EntityTrustapTransactionStatus,
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

					// Create new order
					const [newOrder] = await tx
						.insert(orders)
						.values({
							item_id,
							buyer_id: user.profile_id,
							seller_id: item.profile_id,
							buyer_address: buyerInfo.address_id,
							seller_address: item.seller_address_id,
							shipping_price,
							payment_provider_charge,
							platform_charge: platform_charge_amount!,
							payment_transaction_id: transaction.id,
							shipping_label_id,
						})
						.returning();

					if (!newOrder) {
						return c.json({ error: 'Failed to create order' }, 500);
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
							payment_url: `${environment.PAYMENT_PROVIDER_PAY_PAGE_URL}/${transaction.id}/guest_pay?redirect_uri=${environment.POST_PAYMENT_REDIRECT_URL}/auth/profile/orders?highlight=${newOrder.id}`,
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
			const { id } = c.req.valid('json');
			const user = c.var.user;
			const { db } = createClient();

			try {
				const [updatedItem] = await db
					.update(items)
					.set({ published: false, deleted_at: new Date(), updated_at: new Date() })
					.where(and(eq(items.id, id), eq(items.profile_id, user.profile_id), isNull(items.deleted_at)))
					.returning({ id: items.id });

				if (!updatedItem) {
					return c.json({ message: "Item not found or you don't have permission to delete it" }, 404);
				}

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
			const { id, published } = c.req.valid('json');
			const user = c.var.user;
			const { db } = createClient();
			try {
				const [updatedItem] = await db
					.update(items)
					.set({ published, updated_at: new Date() })
					.where(and(eq(items.id, id), eq(items.profile_id, user.profile_id), isNull(items.deleted_at)))
					.returning({ id: items.id });

				if (!updatedItem) {
					return c.json({ message: "Item not found or you don't have permission to update it" }, 404);
				}

				return c.json(
					{
						message: 'Item publication state updated successfully',
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
	);
