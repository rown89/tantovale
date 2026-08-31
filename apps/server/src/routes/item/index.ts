import { eq, and, desc, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { env } from 'hono/adapter';
import { getCookie } from 'hono/cookie';
import { randomUUID } from 'node:crypto';

import { createClient, type DrizzleClient } from '#database/index';
import {
	categories,
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
	shipping_quotes,
} from '#db-schema';
import { items_properties_values } from '#database/schemas/items_properties_values';
import { createRouter } from '#lib/create-app';
import { authPath } from '#utils/constants';
import { createItemSchema, updateItemSchema, type createItemTypes, type updateItemTypes } from '#extended_schemas';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { itemDetailResponseType } from '#extended_schemas';
import {
	addressStatus,
	EntityTrustapTransactionStatus,
	itemStatus,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CREATION_STATES,
} from '#database/schemas/enumerated_values';
import { calculatePlatformCosts } from '#utils/platform-costs';
import { ORDER_PHASES } from '#utils/order-phases';
import { formatPriceToCents } from '#utils/price-formatter';
import { sendBuyNowOrderCreatedBuyer } from '#mailer/templates/orders/buyer/buy-now-order-created-buyer';
import { resolveOptionalLiveSessionUser } from '#middlewares/authMiddleware/utils';
import { ensurePaymentProviderIdentity } from '#lib/payment-provider-identity';
import { acquireItemCommerceLock, itemCommerceOrderBlockingPredicate } from '#lib/item-commerce-lock';

import { ShipmentService, shippingSnapshotFingerprint } from '../shipment-provider/shipment.service';
import {
	buildGuestPaymentUrl,
	PaymentProviderHttpError,
	PaymentProviderService,
} from '../payments/payment-provider.service';

type ItemTransaction = Parameters<Parameters<DrizzleClient['db']['transaction']>[0]>[0];
type ItemProperties = NonNullable<createItemTypes['properties']>;

type ValidatedProperties = {
	deliveryMethod?: string;
	propertyValueIds: number[];
};

type PropertyValidationMode = 'create' | 'update';

const postgresIntegerMin = -2_147_483_648;
const postgresIntegerMax = 2_147_483_647;
const scalarIdPropertyTypes = new Set(['select', 'radio']);
const multipleIdPropertyTypes = new Set(['select_multi', 'checkbox']);

async function assertItemCommerceMutationAllowed(tx: ItemTransaction, itemId: number): Promise<void> {
	await acquireItemCommerceLock(tx, itemId);
	const [activeOrder] = await tx
		.select({ id: orders.id })
		.from(orders)
		.where(and(eq(orders.item_id, itemId), itemCommerceOrderBlockingPredicate()))
		.limit(1);
	if (activeOrder) throw new Error('Item has an active order and cannot be changed');
}

async function validatePropertiesForSubcategory(
	tx: ItemTransaction,
	subcategoryId: number,
	itemProperties: ItemProperties | undefined,
	mode: PropertyValidationMode,
): Promise<ValidatedProperties> {
	const mappings = await tx
		.select({
			property_id: subcategory_properties.property_id,
			required: subcategory_properties.on_item_create_required,
			editable: subcategory_properties.on_item_update_editable,
			slug: properties.slug,
			type: properties.type,
		})
		.from(subcategory_properties)
		.innerJoin(properties, eq(properties.id, subcategory_properties.property_id))
		.where(eq(subcategory_properties.subcategory_id, subcategoryId));
	const mappingByProperty = new Map(mappings.map((mapping) => [mapping.property_id, mapping]));
	const requestedPropertyIds = itemProperties?.map(({ id }) => id) ?? [];
	const suppliedPropertyIds = new Set(requestedPropertyIds);

	if (suppliedPropertyIds.size !== requestedPropertyIds.length) {
		throw new Error('Each property can be supplied only once');
	}

	if (mappings.some((mapping) => mapping.required && !suppliedPropertyIds.has(mapping.property_id))) {
		throw new Error('All required properties must be provided');
	}

	const suppliedProperties =
		itemProperties?.map((property) => {
			const mapping = mappingByProperty.get(property.id);
			if (!mapping || mapping.slug !== property.slug) {
				throw new Error('Some properties are not mapped to this subcategory');
			}
			if (mode === 'update' && !mapping.editable) {
				throw new Error(`Property ${mapping.slug} cannot be edited`);
			}

			if (scalarIdPropertyTypes.has(mapping.type) || multipleIdPropertyTypes.has(mapping.type)) {
				const expectsMultiple = multipleIdPropertyTypes.has(mapping.type);
				if (!expectsMultiple && Array.isArray(property.value)) {
					throw new Error(`Property ${mapping.slug} requires exactly one scalar property-value ID`);
				}
				if (expectsMultiple && (!Array.isArray(property.value) || property.value.length === 0)) {
					throw new Error(`Property ${mapping.slug} requires a nonempty array of property-value IDs`);
				}
				const values = Array.isArray(property.value) ? property.value : [property.value];
				const ids = values.map((value) => {
					if (typeof value === 'boolean' || (typeof value === 'string' && !/^[1-9]\d*$/.test(value))) {
						throw new Error(`Property ${mapping.slug} requires property-value IDs`);
					}
					const id = Number(value);
					if (!Number.isSafeInteger(id) || id <= 0) {
						throw new Error(`Property ${mapping.slug} requires positive integer property-value IDs`);
					}
					if (id > postgresIntegerMax) {
						throw new Error(`Property ${mapping.slug} requires 32-bit property-value IDs`);
					}
					return id;
				});
				return { mapping, kind: 'id' as const, values: ids };
			}

			if (mapping.type === 'boolean') {
				if (typeof property.value !== 'boolean') {
					throw new Error(`Property ${mapping.slug} requires a raw boolean value`);
				}
				return { mapping, kind: 'boolean' as const, value: property.value };
			}

			if (mapping.type === 'number' || mapping.type === 'range') {
				if (
					typeof property.value !== 'number' ||
					!Number.isSafeInteger(property.value) ||
					Array.isArray(property.value)
				) {
					throw new Error(`Property ${mapping.slug} requires a raw integer numeric value`);
				}
				if (property.value < postgresIntegerMin || property.value > postgresIntegerMax) {
					throw new Error(`Property ${mapping.slug} requires a 32-bit integer numeric value`);
				}
				return { mapping, kind: 'number' as const, value: property.value };
			}

			throw new Error(`Unsupported property type ${mapping.type}`);
		}) ?? [];
	const suppliedPropertyIdList = [...new Set(suppliedProperties.map(({ mapping }) => mapping.property_id))];
	const storedValues = suppliedPropertyIdList.length
		? await tx
				.select({
					id: property_values.id,
					property_id: property_values.property_id,
					value: property_values.value,
					boolean_value: property_values.boolean_value,
					numeric_value: property_values.numeric_value,
				})
				.from(property_values)
				.where(inArray(property_values.property_id, suppliedPropertyIdList))
		: [];
	const resolvedValues: typeof storedValues = [];
	let deliveryMethod: string | undefined;

	for (const suppliedProperty of suppliedProperties) {
		const candidates = storedValues.filter(({ property_id }) => property_id === suppliedProperty.mapping.property_id);
		const matches =
			suppliedProperty.kind === 'id'
				? candidates.filter(({ id }) => suppliedProperty.values.includes(id))
				: suppliedProperty.kind === 'boolean'
					? candidates.filter(({ boolean_value }) => boolean_value === suppliedProperty.value)
					: candidates.filter(({ numeric_value }) => numeric_value === suppliedProperty.value);
		const expectedMatchCount = suppliedProperty.kind === 'id' ? new Set(suppliedProperty.values).size : 1;
		if (matches.length !== expectedMatchCount) {
			throw new Error(`Property ${suppliedProperty.mapping.slug} has a missing or ambiguous value`);
		}
		resolvedValues.push(...matches);

		if (suppliedProperty.mapping.slug === 'delivery_method') {
			if (matches.length !== 1 || typeof matches[0]?.value !== 'string') {
				throw new Error('Delivery method requires exactly one stored option');
			}
			deliveryMethod = matches[0].value;
		}
	}

	return {
		deliveryMethod,
		propertyValueIds: [...new Set(resolvedValues.map(({ id }) => id))],
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

function validateEasyPayMode(
	easyPay: boolean,
	subcategorySupportsEasyPay: boolean,
	deliveryMethod: string | undefined,
	shipping: createItemTypes['shipping'],
): void {
	if (easyPay) {
		if (!subcategorySupportsEasyPay) throw new Error('This subcategory does not support Easy Pay');
		if (deliveryMethod !== 'shipping_easy_pay') {
			throw new Error('Easy Pay requires the Easy Pay shipping method');
		}
	} else if (deliveryMethod === 'shipping_easy_pay') {
		throw new Error('Easy Pay shipping requires Easy Pay to be enabled');
	}

	validateShipping(deliveryMethod, shipping);
}

async function requirePublicSubcategory(tx: ItemTransaction, subcategoryId: number) {
	const [availableSubcategory] = await tx
		.select({ id: subcategories.id, easy_pay: subcategories.easy_pay })
		.from(subcategories)
		.innerJoin(categories, eq(categories.id, subcategories.category_id))
		.where(and(eq(subcategories.id, subcategoryId), eq(subcategories.published, true), eq(categories.published, true)))
		.limit(1);
	if (!availableSubcategory) throw new Error('Subcategory is not publicly available');
	return availableSubcategory;
}

async function requireActiveProfileAddress(tx: ItemTransaction, addressId: number, profileId: number): Promise<void> {
	const [itemAddress] = await tx
		.select({ id: addresses.id })
		.from(addresses)
		.where(
			and(eq(addresses.id, addressId), eq(addresses.profile_id, profileId), eq(addresses.status, addressStatus.ACTIVE)),
		)
		.limit(1);
	if (!itemAddress) throw new Error('Address must be active and belong to the authenticated profile');
}

async function validateCreateItemState(
	tx: ItemTransaction,
	profileId: number,
	commons: createItemTypes['commons'],
	requestedProperties: createItemTypes['properties'],
	shipping: createItemTypes['shipping'],
): Promise<ValidatedProperties> {
	const availableSubcategory = await requirePublicSubcategory(tx, commons.subcategory_id);
	await requireActiveProfileAddress(tx, commons.address_id, profileId);
	const validatedProperties = await validatePropertiesForSubcategory(
		tx,
		commons.subcategory_id,
		requestedProperties,
		'create',
	);
	validateEasyPayMode(
		commons.easy_pay ?? false,
		availableSubcategory.easy_pay === true,
		validatedProperties.deliveryMethod,
		shipping,
	);
	return validatedProperties;
}

async function validateEditItemState(
	tx: ItemTransaction,
	itemId: number,
	profileId: number,
	commons: updateItemTypes['commons'],
	requestedProperties: updateItemTypes['properties'],
	shipping: updateItemTypes['shipping'],
	lockItemForUpdate = false,
) {
	const itemPredicate = and(eq(items.id, itemId), eq(items.profile_id, profileId), isNull(items.deleted_at));
	const [existingItem] = lockItemForUpdate
		? await tx.select().from(items).where(itemPredicate).for('update').limit(1)
		: await tx.select().from(items).where(itemPredicate).limit(1);
	if (!existingItem) return undefined;

	if (commons?.address_id !== undefined && commons.address_id !== existingItem.address_id) {
		await requireActiveProfileAddress(tx, commons.address_id, profileId);
	}
	const targetSubcategoryId = commons?.subcategory_id ?? existingItem.subcategory_id;
	const targetSubcategory = await requirePublicSubcategory(tx, targetSubcategoryId);
	if (
		commons?.subcategory_id !== undefined &&
		commons.subcategory_id !== existingItem.subcategory_id &&
		requestedProperties === undefined
	) {
		throw new Error('Properties are required when changing subcategory');
	}

	const validatedProperties =
		requestedProperties === undefined
			? undefined
			: await validatePropertiesForSubcategory(tx, targetSubcategoryId, requestedProperties, 'update');
	let deliveryMethod = validatedProperties?.deliveryMethod;
	if (!deliveryMethod) {
		const [storedDelivery] = await tx
			.select({ value: property_values.value })
			.from(items_properties_values)
			.innerJoin(property_values, eq(property_values.id, items_properties_values.property_value_id))
			.innerJoin(properties, eq(properties.id, property_values.property_id))
			.where(and(eq(items_properties_values.item_id, itemId), eq(properties.slug, 'delivery_method')))
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
	const effectiveEasyPay = commons?.easy_pay ?? existingItem.easy_pay;
	validateEasyPayMode(effectiveEasyPay, targetSubcategory.easy_pay === true, deliveryMethod, effectiveShipping);

	return { effectiveEasyPay, validatedProperties };
}

export const itemRoute = createRouter()
	// THIS ENDPOINT CAN BE CONSUMED BY BOTH LOGGED AND GUEST USERS
	.get('/:id', async (c) => {
		const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = env<{
			ACCESS_TOKEN_SECRET: string;
			REFRESH_TOKEN_SECRET: string;
		}>(c);

		const id = Number(c.req.param('id'));

		if (!Number.isSafeInteger(id) || id <= 0 || id > postgresIntegerMax) {
			return c.json({ message: 'Invalid item ID' }, 400);
		}

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
				.innerJoin(categories, eq(categories.id, subcategories.category_id))
				.innerJoin(addresses, eq(addresses.id, items.address_id))
				.innerJoin(city, eq(city.id, addresses.city_id))
				.innerJoin(province, eq(province.id, addresses.province_id))
				.innerJoin(profiles, eq(profiles.id, items.profile_id))
				.innerJoin(users, eq(users.id, profiles.user_id))
				.where(
					and(
						eq(items.id, id),
						eq(items.published, true),
						eq(subcategories.published, true),
						eq(categories.published, true),
						isNull(items.deleted_at),
					),
				)
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

			await db.transaction((tx) =>
				validateCreateItemState(tx, user.profile_id, commons, requestedProperties, shipping),
			);
			if (commons.easy_pay) {
				// No item transaction is held here: the remote identity and its local ID form an intentional durable boundary.
				await ensurePaymentProviderIdentity(db, user, c.req.raw.headers.get('x-forwarded-for') || '127.0.0.1');
			}

			return await db.transaction(async (tx) => {
				const validatedProperties = await validateCreateItemState(
					tx,
					user.profile_id,
					commons,
					requestedProperties,
					shipping,
				);

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
		if (!Number.isSafeInteger(id) || id <= 0 || id > postgresIntegerMax) {
			return c.json({ message: 'Invalid item ID' }, 400);
		}

		const user = c.var.user;
		const { commons, properties: requestedProperties, shipping } = c.req.valid('json');
		const hasMutableFields =
			(commons !== undefined && Object.keys(commons).length > 0) ||
			requestedProperties !== undefined ||
			(shipping !== undefined && Object.keys(shipping).length > 0);
		if (!hasMutableFields) return c.json({ message: 'At least one item field is required' }, 400);

		const { db } = createClient();
		try {
			const preflight = await db.transaction(async (tx) => {
				await assertItemCommerceMutationAllowed(tx, id);
				return validateEditItemState(tx, id, user.profile_id, commons, requestedProperties, shipping);
			});
			if (!preflight) return c.json({ message: 'Item not found' }, 404);
			if (preflight.effectiveEasyPay) {
				// No item transaction is held here: the remote identity and its local ID form an intentional durable boundary.
				await ensurePaymentProviderIdentity(db, user, c.req.raw.headers.get('x-forwarded-for') || '127.0.0.1');
			}

			const result = await db.transaction(async (tx) => {
				await assertItemCommerceMutationAllowed(tx, id);
				const validation = await validateEditItemState(
					tx,
					id,
					user.profile_id,
					commons,
					requestedProperties,
					shipping,
					true,
				);
				if (!validation) return undefined;
				const { validatedProperties } = validation;

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

				const [updatedItem] = await tx
					.update(items)
					.set(updateValues)
					.where(and(eq(items.id, id), eq(items.profile_id, user.profile_id), isNull(items.deleted_at)))
					.returning({ id: items.id });
				if (!updatedItem) return undefined;

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

				return updatedItem.id;
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
				item_id: z.number().int().positive().max(postgresIntegerMax),
			}),
		),
		async (c) => {
			const user = c.var.user;
			const { item_id } = c.req.valid('json');

			try {
				const loadPurchaseContext = async (query: Pick<DrizzleClient['db'], 'select'>) => {
					const [item] = await query
						.select({
							id: items.id,
							title: items.title,
							profile_id: items.profile_id,
							price: items.price,
							payment_provider_id: profiles.payment_provider_id,
							seller_address_id: items.address_id,
							seller_username: users.username,
						})
						.from(items)
						.innerJoin(profiles, eq(profiles.id, items.profile_id))
						.innerJoin(users, eq(users.id, profiles.user_id))
						.innerJoin(
							addresses,
							and(
								eq(addresses.id, items.address_id),
								eq(addresses.profile_id, items.profile_id),
								eq(addresses.status, addressStatus.ACTIVE),
							),
						)
						.innerJoin(subcategories, eq(items.subcategory_id, subcategories.id))
						.innerJoin(categories, eq(subcategories.category_id, categories.id))
						.where(
							and(
								eq(items.id, item_id),
								eq(items.status, itemStatus.AVAILABLE),
								eq(items.published, true),
								eq(items.easy_pay, true),
								isNull(items.deleted_at),
								eq(subcategories.published, true),
								eq(categories.published, true),
							),
						)
						.limit(1);
					const [buyerInfo] = await query
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
					return { item, buyerInfo };
				};

				const { db } = createClient();
				const paymentAttemptId = randomUUID();
				const preparation = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, item_id);
					const current = await loadPurchaseContext(tx);
					if (!current.item || !current.item.payment_provider_id) {
						return { error: 'Item not available', status: 400 as const };
					}
					if (current.item.profile_id === user.profile_id) {
						return { error: 'You cannot buy your own item', status: 400 as const };
					}
					if (!current.buyerInfo?.payment_provider_id) {
						return { error: 'Buyer information not found or buyer has no payment provider id', status: 404 as const };
					}
					const [activeOrder] = await tx
						.select({ id: orders.id })
						.from(orders)
						.where(and(eq(orders.item_id, item_id), itemCommerceOrderBlockingPredicate()))
						.limit(1);
					if (activeOrder) return { error: 'An active order already exists for this item', status: 400 as const };

					const { platform_charge_amount: platformCharge } = await calculatePlatformCosts(
						{ price: current.item.price },
						{ platform_charge_amount: true },
					);
					if (platformCharge === undefined) throw new Error('Failed to calculate platform charge amount');
					const transactionPrice = current.item.price + platformCharge;
					if (!Number.isSafeInteger(transactionPrice) || transactionPrice > postgresIntegerMax) {
						return { error: 'Item price exceeds the supported range', status: 400 as const };
					}
					const [preparingOrder] = await tx
						.insert(orders)
						.values({
							item_id,
							buyer_id: user.profile_id,
							seller_id: current.item.profile_id,
							buyer_address: current.buyerInfo.address_id,
							seller_address: current.item.seller_address_id,
							shipping_price: 0,
							payment_provider_charge: 0,
							platform_charge: platformCharge,
							shipping_label_id: 'preparing',
							item_price: current.item.price,
							payment_attempt_id: paymentAttemptId,
							payment_creation_state: PAYMENT_CREATION_STATES.PREPARING,
						})
						.returning();
					if (!preparingOrder) throw new Error('Failed to reserve order');
					return {
						preparingOrder,
						buyerProviderId: current.buyerInfo.payment_provider_id,
						sellerProviderId: current.item.payment_provider_id,
						itemTitle: current.item.title,
						transactionPrice,
						buyerAddressId: current.buyerInfo.address_id,
						sellerAddressId: current.item.seller_address_id,
						itemPrice: current.item.price,
						mail: {
							to: current.buyerInfo.email,
							seller_username: current.item.seller_username,
							itemName: current.item.title,
						},
					};
				});

				if ('error' in preparation) return c.json({ error: preparation.error }, preparation.status);

				let quote: Awaited<ReturnType<ShipmentService['createShippingQuote']>>;
				let paymentProviderCharge: number;
				let calculatorVersion: number;
				try {
					quote = await new ShipmentService().createShippingQuote(
						item_id,
						user.profile_id,
						user.email,
						paymentAttemptId,
					);
					const costs = await calculatePlatformCosts(
						{ price: preparation.transactionPrice, postage_fee: formatPriceToCents(Number(quote.amount)) },
						{ payment_provider_charge: true },
					);
					if (
						costs.payment_provider_charge === undefined ||
						costs.payment_provider_charge_calculator_version === undefined
					) {
						throw new Error('Failed to calculate payment provider charge');
					}
					paymentProviderCharge = costs.payment_provider_charge;
					calculatorVersion = costs.payment_provider_charge_calculator_version;
				} catch (providerError) {
					await db.transaction(async (tx) => {
						await tx.delete(orders).where(eq(orders.id, preparation.preparingOrder.id));
						await tx.delete(shipping_quotes).where(eq(shipping_quotes.checkout_attempt_id, paymentAttemptId));
					});
					throw providerError;
				}

				const reservation = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, item_id);
					const current = await loadPurchaseContext(tx);
					if (
						!current.item ||
						!current.buyerInfo?.payment_provider_id ||
						current.item.price !== preparation.itemPrice ||
						current.item.profile_id !== preparation.preparingOrder.seller_id ||
						current.item.payment_provider_id !== preparation.sellerProviderId ||
						current.buyerInfo.payment_provider_id !== preparation.buyerProviderId ||
						current.item.seller_address_id !== preparation.sellerAddressId ||
						current.buyerInfo.address_id !== preparation.buyerAddressId
					) {
						await tx.delete(orders).where(eq(orders.id, preparation.preparingOrder.id));
						await tx.delete(shipping_quotes).where(eq(shipping_quotes.id, quote.shipping_quote_id));
						return { error: 'Item or checkout terms changed', status: 409 as const };
					}
					const [storedQuote] = await tx
						.select()
						.from(shipping_quotes)
						.where(
							and(
								eq(shipping_quotes.id, quote.shipping_quote_id),
								eq(shipping_quotes.item_id, item_id),
								eq(shipping_quotes.buyer_profile_id, user.profile_id),
								isNull(shipping_quotes.consumed_at),
							),
						)
						.for('update')
						.limit(1);
					const shippingState = storedQuote
						? {
								itemData: await new ShipmentService().getItemData(tx, item_id),
								buyerProfile: await new ShipmentService().getBuyerProfile(tx, user.profile_id),
							}
						: undefined;
					if (
						!storedQuote ||
						storedQuote.expires_at <= new Date() ||
						!shippingState ||
						shippingSnapshotFingerprint(shippingState) !== storedQuote.snapshot_fingerprint
					) {
						await tx.delete(orders).where(eq(orders.id, preparation.preparingOrder.id));
						if (storedQuote) await tx.delete(shipping_quotes).where(eq(shipping_quotes.id, storedQuote.id));
						return { error: 'Shipping quote is no longer valid', status: 409 as const };
					}
					const [consumed] = await tx
						.update(shipping_quotes)
						.set({ consumed_at: new Date() })
						.where(and(eq(shipping_quotes.id, storedQuote.id), isNull(shipping_quotes.consumed_at)))
						.returning({ id: shipping_quotes.id });
					if (!consumed) throw new Error('Shipping quote was already consumed');
					const [reservedOrder] = await tx
						.update(orders)
						.set({
							shipping_price: storedQuote.amount,
							payment_provider_charge: paymentProviderCharge,
							shipping_label_id: storedQuote.shippo_shipment_id,
							shipping_quote_id: storedQuote.id,
							payment_creation_state: PAYMENT_CREATION_STATES.CREATING,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(orders.id, preparation.preparingOrder.id),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.PREPARING),
							),
						)
						.returning();
					if (!reservedOrder) throw new Error('Failed to complete checkout preparation');
					return {
						reservedOrder,
						buyerProviderId: preparation.buyerProviderId,
						sellerProviderId: preparation.sellerProviderId,
						itemTitle: preparation.itemTitle,
						transactionPrice: preparation.transactionPrice,
						shippingPrice: storedQuote.amount,
						paymentProviderCharge,
						calculatorVersion,
						mail: preparation.mail,
					};
				});
				if ('error' in reservation) return c.json({ error: reservation.error }, reservation.status);

				let transaction: Awaited<ReturnType<PaymentProviderService['createTransactionWithBothUsers']>>;
				try {
					transaction = await new PaymentProviderService().createTransactionWithBothUsers({
						buyer_id: reservation.buyerProviderId,
						seller_id: reservation.sellerProviderId,
						creator_role: 'buyer',
						currency: 'eur',
						description: `Transaction for ${reservation.itemTitle} - (Buy Now, ref ${paymentAttemptId})`,
						price: reservation.transactionPrice,
						postage_fee: reservation.shippingPrice,
						charge: reservation.paymentProviderCharge,
						charge_calculator_version: reservation.calculatorVersion,
					});
					if (!transaction) throw new Error('Failed to create Trustap transaction');
				} catch (providerError) {
					if (providerError instanceof PaymentProviderHttpError) {
						await db.transaction(async (tx) => {
							await acquireItemCommerceLock(tx, item_id);
							await tx
								.delete(orders)
								.where(
									and(
										eq(orders.id, reservation.reservedOrder.id),
										eq(orders.item_id, item_id),
										isNull(orders.payment_transaction_id),
									),
								);
							await tx.delete(shipping_quotes).where(eq(shipping_quotes.id, quote.shipping_quote_id));
						});
					} else {
						await db
							.update(orders)
							.set({
								payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
								updated_at: new Date(),
							})
							.where(eq(orders.id, reservation.reservedOrder.id));
					}
					throw providerError;
				}

				let completedOrder: typeof reservation.reservedOrder;
				try {
					completedOrder = await db.transaction(async (tx) => {
						await acquireItemCommerceLock(tx, item_id);
						const [storedReservation] = await tx
							.select({ id: orders.id })
							.from(orders)
							.where(
								and(
									eq(orders.id, reservation.reservedOrder.id),
									eq(orders.item_id, item_id),
									eq(orders.buyer_id, user.profile_id),
									isNull(orders.payment_transaction_id),
								),
							)
							.limit(1);
						if (!storedReservation) throw new Error('Order reservation not found');
						await tx.insert(entityTrustapTransactions).values({
							entityId: item_id,
							sellerId: transaction.seller_id,
							buyerId: transaction.buyer_id,
							transactionId: transaction.id,
							transactionType: 'online_payment',
							status: transaction.status as EntityTrustapTransactionStatus,
							price: reservation.transactionPrice,
							charge: reservation.paymentProviderCharge,
							chargeSeller: transaction.charge_seller || 0,
							currency: 'eur',
							entityTitle: reservation.itemTitle,
							claimedBySeller: false,
							claimedByBuyer: false,
							complaintPeriodDeadline: null,
						});
						const [updatedOrder] = await tx
							.update(orders)
							.set({
								payment_transaction_id: transaction.id,
								payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
								updated_at: new Date(),
							})
							.where(and(eq(orders.id, storedReservation.id), isNull(orders.payment_transaction_id)))
							.returning();
						if (!updatedOrder) throw new Error('Failed to complete order reservation');
						return updatedOrder;
					});
				} catch (finalizationError) {
					try {
						await db
							.update(orders)
							.set({
								payment_transaction_id: transaction.id,
								payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
								updated_at: new Date(),
							})
							.where(eq(orders.id, reservation.reservedOrder.id));
					} catch {
						await db
							.update(orders)
							.set({
								legacy_payment_transaction_id: transaction.id,
								payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
								updated_at: new Date(),
							})
							.where(eq(orders.id, reservation.reservedOrder.id));
					}
					throw finalizationError;
				}

				try {
					await sendBuyNowOrderCreatedBuyer(reservation.mail);
				} catch (error) {
					console.error('Failed to send buy-now notification:', error);
				}
				return c.json(
					{
						success: true,
						order: { id: completedOrder.id, status: completedOrder.status },
						payment_url: buildGuestPaymentUrl(transaction.id, completedOrder.id),
						message: 'Order created, complete the payment for the next step',
					},
					200,
				);
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
				const [updatedItem] = await db.transaction(async (tx) => {
					await assertItemCommerceMutationAllowed(tx, id);
					return tx
						.update(items)
						.set({ published: false, deleted_at: new Date(), updated_at: new Date() })
						.where(and(eq(items.id, id), eq(items.profile_id, user.profile_id), isNull(items.deleted_at)))
						.returning({ id: items.id });
				});

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
				if (error instanceof Error && error.message === 'Item has an active order and cannot be changed') {
					return c.json({ message: error.message }, 400);
				}
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
				id: z.number().int().positive().max(postgresIntegerMax),
				published: z.boolean(),
			}),
		),
		async (c) => {
			const { id, published } = c.req.valid('json');
			const user = c.var.user;
			const { db } = createClient();
			try {
				if (published) {
					const [publishableItem] = await db
						.select({ id: items.id })
						.from(items)
						.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
						.innerJoin(categories, eq(categories.id, subcategories.category_id))
						.where(
							and(
								eq(items.id, id),
								eq(items.profile_id, user.profile_id),
								eq(subcategories.published, true),
								eq(categories.published, true),
								isNull(items.deleted_at),
							),
						)
						.limit(1);
					if (!publishableItem) {
						return c.json({ message: "Item not found or you don't have permission to update it" }, 404);
					}
				}

				const [updatedItem] = await db.transaction(async (tx) => {
					await assertItemCommerceMutationAllowed(tx, id);
					return tx
						.update(items)
						.set({ published, updated_at: new Date() })
						.where(and(eq(items.id, id), eq(items.profile_id, user.profile_id), isNull(items.deleted_at)))
						.returning({ id: items.id });
				});

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
				if (error instanceof Error && error.message === 'Item has an active order and cannot be changed') {
					return c.json({ message: error.message }, 400);
				}
				return c.json(
					{
						message: error instanceof Error ? error.message : `Failed to delete item ${id}`,
					},
					500,
				);
			}
		},
	);
