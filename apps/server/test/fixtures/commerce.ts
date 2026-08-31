import type { z } from 'zod/v4';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';

import {
	categories,
	cities,
	countries,
	items,
	items_images,
	items_properties_values,
	orders,
	orders_proposals,
	shipping_quotes,
	properties,
	property_values,
	states,
	subcategories,
	subcategory_properties,
	type InsertOrder,
	type InsertOrderProposal,
	type SelectAddress,
	type SelectItem,
	type SelectItemImage,
	type SelectOrder,
	type SelectOrderProposal,
} from '../../src/database/schemas/schema';
import {
	ORDER_PHASES,
	ORDER_PROPOSAL_PHASES,
	itemStatus,
	type ItemImagesSize,
} from '../../src/database/schemas/enumerated_values';
import { createItemSchema, type createItemTypes } from '../../src/extended_schemas/item';
import { loginAs } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { CookieJar } from '../helpers/request';
import { createAddressFixture } from './addresses';
import { createCatalogFixture } from './catalog';
import { createUserFixture, type UserFixture, uniqueValue } from './factories';

type CommerceActor = UserFixture & { jar: CookieJar; address: SelectAddress };

async function createCommerceCatalogFixture() {
	const catalog = await createCatalogFixture();
	const { db } = getTestDatabase();
	const [buyerCountry, outsiderCountry] = await db
		.insert(countries)
		.values([
			{ id: 907001, name: 'France', iso3: 'FRA', iso2: 'FR', phonecode: '33' },
			{ id: 907002, name: 'Germany', iso3: 'DEU', iso2: 'DE', phonecode: '49' },
		])
		.returning();
	if (!buyerCountry || !outsiderCountry) throw new Error('Commerce actor countries insert failed');

	const [buyerState, outsiderState] = await db
		.insert(states)
		.values([
			{
				id: 907011,
				name: 'Ile-de-France',
				country_id: buyerCountry.id,
				country_code: buyerCountry.iso2,
				state_code: 'IDF',
			},
			{
				id: 907012,
				name: 'Berlin',
				country_id: outsiderCountry.id,
				country_code: outsiderCountry.iso2,
				state_code: 'BE',
			},
		])
		.returning();
	if (!buyerState || !outsiderState) throw new Error('Commerce actor states insert failed');

	const [buyerCity, outsiderCity] = await db
		.insert(cities)
		.values([
			{
				id: 907021,
				name: 'Paris',
				state_id: buyerState.id,
				state_code: buyerState.state_code ?? 'IDF',
				country_id: buyerCountry.id,
				country_code: buyerCountry.iso2,
				latitude: '48.85660000',
				longitude: '2.35220000',
			},
			{
				id: 907022,
				name: 'Berlin',
				state_id: outsiderState.id,
				state_code: outsiderState.state_code ?? 'BE',
				country_id: outsiderCountry.id,
				country_code: outsiderCountry.iso2,
				latitude: '52.52000000',
				longitude: '13.40500000',
			},
		])
		.returning();
	if (!buyerCity || !outsiderCity) throw new Error('Commerce actor cities insert failed');

	const [deliveryProperty] = await db
		.insert(properties)
		.values({ name: 'Delivery Methods', slug: 'delivery_method', type: 'select' })
		.returning();
	if (!deliveryProperty) throw new Error('Commerce delivery property insert failed');

	const [deliveryMapping] = await db
		.insert(subcategory_properties)
		.values({
			property_id: deliveryProperty.id,
			subcategory_id: catalog.childSubcategory.id,
			position: 99,
			on_item_create_required: true,
			on_item_update_editable: true,
		})
		.returning();
	if (!deliveryMapping) throw new Error('Commerce delivery mapping insert failed');

	const [pickup, shipping, easyPay] = await db
		.insert(property_values)
		.values([
			{ property_id: deliveryProperty.id, name: 'Pickup', value: 'pickup' },
			{ property_id: deliveryProperty.id, name: 'Shipping', value: 'shipping' },
			{ property_id: deliveryProperty.id, name: 'Shipping (Easy Pay)', value: 'shipping_easy_pay' },
		])
		.returning();
	if (!pickup || !shipping || !easyPay) throw new Error('Commerce delivery values insert failed');

	return {
		...catalog,
		actorLocations: {
			seller: { country: catalog.country, state: catalog.state, city: catalog.city, province: catalog.city },
			buyer: { country: buyerCountry, state: buyerState, city: buyerCity, province: buyerCity },
			outsider: { country: outsiderCountry, state: outsiderState, city: outsiderCity, province: outsiderCity },
		},
		delivery: {
			property: deliveryProperty,
			mapping: deliveryMapping,
			values: { pickup, shipping, easyPay },
		},
	};
}

export type CommerceCatalogFixture = Awaited<ReturnType<typeof createCommerceCatalogFixture>>;

export type CommerceActorGraph = {
	seller: CommerceActor;
	buyer: CommerceActor;
	outsider: CommerceActor;
	catalog: CommerceCatalogFixture;
};

type ItemBodyOverrides = {
	commons?: Partial<createItemTypes['commons']>;
	shipping?: Partial<NonNullable<createItemTypes['shipping']>>;
	properties?: createItemTypes['properties'];
};

let reusableCatalog: CommerceCatalogFixture | undefined;
let graphCreationQueue: Promise<void> = Promise.resolve();

function requireInserted<Row>(row: Row | undefined, label: string): Row {
	if (!row) {
		throw new Error(`${label} fixture insert failed`);
	}

	return row;
}

function fixtureRowsMatch<Row extends { id: number }>(
	actualRows: Row[],
	expectedRows: Row[],
	immutableFields: readonly (keyof Row)[],
): boolean {
	return (
		actualRows.length === expectedRows.length &&
		expectedRows.every((expected) => {
			const actual = actualRows.find(({ id }) => id === expected.id);
			return actual !== undefined && immutableFields.every((field) => Object.is(actual[field], expected[field]));
		})
	);
}

async function resolveCatalogFixture(): Promise<CommerceCatalogFixture> {
	const { db } = getTestDatabase();
	const cached = reusableCatalog;
	if (!cached) {
		const created = await createCommerceCatalogFixture();
		reusableCatalog = created;
		return created;
	}

	const expectedCategories = [cached.publishedCategory, cached.unpublishedCategory];
	const expectedCountries = [
		cached.actorLocations.seller.country,
		cached.actorLocations.buyer.country,
		cached.actorLocations.outsider.country,
	];
	const expectedStates = [
		cached.actorLocations.seller.state,
		cached.actorLocations.buyer.state,
		cached.actorLocations.outsider.state,
	];
	const expectedCities = [
		cached.actorLocations.seller.city,
		cached.actorLocations.buyer.city,
		cached.actorLocations.outsider.city,
	];
	const expectedSubcategories = [cached.parentSubcategory, cached.childSubcategory, cached.unpublishedSubcategory];
	const expectedProperties = [
		...Object.values(cached.properties),
		cached.delivery.property,
		cached.unpublishedMapping.property,
	];
	const expectedMappings = [
		...Object.values(cached.mappings),
		cached.delivery.mapping,
		cached.unpublishedMapping.mapping,
	];
	const expectedPropertyValues = [
		...Object.values(cached.propertyValues),
		...Object.values(cached.delivery.values),
		cached.unpublishedMapping.propertyValue,
	];
	const [
		countryRows,
		stateRows,
		cityRows,
		categoryRows,
		subcategoryRows,
		propertyRows,
		mappingRows,
		propertyValueRows,
	] = await Promise.all([
		db
			.select()
			.from(countries)
			.where(
				inArray(
					countries.id,
					expectedCountries.map(({ id }) => id),
				),
			),
		db
			.select()
			.from(states)
			.where(
				inArray(
					states.id,
					expectedStates.map(({ id }) => id),
				),
			),
		db
			.select()
			.from(cities)
			.where(
				inArray(
					cities.id,
					expectedCities.map(({ id }) => id),
				),
			),
		db
			.select()
			.from(categories)
			.where(
				inArray(
					categories.id,
					expectedCategories.map(({ id }) => id),
				),
			),
		db
			.select()
			.from(subcategories)
			.where(
				inArray(
					subcategories.id,
					expectedSubcategories.map(({ id }) => id),
				),
			),
		db
			.select()
			.from(properties)
			.where(
				inArray(
					properties.id,
					expectedProperties.map(({ id }) => id),
				),
			),
		db
			.select()
			.from(subcategory_properties)
			.where(
				inArray(
					subcategory_properties.id,
					expectedMappings.map(({ id }) => id),
				),
			),
		db
			.select()
			.from(property_values)
			.where(
				inArray(
					property_values.id,
					expectedPropertyValues.map(({ id }) => id),
				),
			),
	]);
	const referencedRowCount = [
		countryRows,
		stateRows,
		cityRows,
		categoryRows,
		subcategoryRows,
		propertyRows,
		mappingRows,
		propertyValueRows,
	].reduce((count, rows) => count + rows.length, 0);

	if (referencedRowCount === 0) {
		const created = await createCommerceCatalogFixture();
		reusableCatalog = created;
		return created;
	}

	const catalogIsComplete =
		fixtureRowsMatch(countryRows, expectedCountries, ['id', 'name', 'iso3', 'iso2', 'phonecode']) &&
		fixtureRowsMatch(stateRows, expectedStates, ['id', 'name', 'country_id', 'country_code', 'state_code']) &&
		fixtureRowsMatch(cityRows, expectedCities, [
			'id',
			'name',
			'state_id',
			'state_code',
			'country_id',
			'country_code',
			'latitude',
			'longitude',
		]) &&
		fixtureRowsMatch(categoryRows, expectedCategories, ['id', 'name', 'slug', 'published']) &&
		fixtureRowsMatch(subcategoryRows, expectedSubcategories, [
			'id',
			'name',
			'slug',
			'category_id',
			'parent_id',
			'easy_pay',
			'published',
		]) &&
		fixtureRowsMatch(propertyRows, expectedProperties, ['id', 'name', 'slug', 'type']) &&
		fixtureRowsMatch(mappingRows, expectedMappings, [
			'id',
			'property_id',
			'subcategory_id',
			'position',
			'on_item_create_required',
			'on_item_update_editable',
			'is_searchable',
		]) &&
		fixtureRowsMatch(propertyValueRows, expectedPropertyValues, [
			'id',
			'property_id',
			'name',
			'value',
			'numeric_value',
			'boolean_value',
		]);

	if (!catalogIsComplete) {
		throw new Error('Cached commerce catalog is incomplete or mutated');
	}

	return cached;
}

async function positionActorIdentitySequences(): Promise<void> {
	const { client } = getTestDatabase();
	const { rows } = await client.query<{ identity_base: string }>(`
		SELECT GREATEST(
			COALESCE((SELECT MAX(id) FROM users), 0),
			COALESCE((SELECT MAX(id) FROM profiles), 0)
		)::text AS identity_base
	`);
	const identityBase = Number(rows[0]?.identity_base ?? 0);

	if (!Number.isSafeInteger(identityBase) || identityBase < 0) {
		throw new Error('Unable to determine a safe commerce actor identity base');
	}

	// Test-only sequence positioning. getTestDatabase() guards this raw SQL by rejecting every non-disposable DB name.
	await client.query(
		`SELECT
			setval(pg_get_serial_sequence('public.profiles', 'id'), $1::bigint, false),
			setval(pg_get_serial_sequence('public.users', 'id'), $2::bigint, false)`,
		[identityBase + 1, identityBase + 4],
	);
}

async function buildCommerceActors(): Promise<CommerceActorGraph> {
	const catalog = await resolveCatalogFixture();
	await positionActorIdentitySequences();

	const sellerFixture = await createUserFixture({
		profile: {
			name: 'Seller',
			surname: 'Fixture',
			payment_provider_id: uniqueValue('trustap-seller'),
		},
	});
	const buyerFixture = await createUserFixture({
		profile: {
			name: 'Buyer',
			surname: 'Fixture',
			payment_provider_id: uniqueValue('trustap-buyer'),
		},
	});
	const outsiderFixture = await createUserFixture({
		profile: {
			name: 'Outsider',
			surname: 'Fixture',
			payment_provider_id: uniqueValue('trustap-outsider'),
		},
	});

	const [sellerAddress, buyerAddress, outsiderAddress] = await Promise.all([
		createAddressFixture(sellerFixture.profile.id, {
			label: 'Seller home',
			street_address: 'Corso Venditore',
			civic_number: '11A',
			city_id: catalog.actorLocations.seller.city.id,
			province_id: catalog.actorLocations.seller.province.id,
			postal_code: 20121,
			country_code: catalog.actorLocations.seller.country.iso2,
			phone: '+390212345611',
			status: 'active',
		}),
		createAddressFixture(buyerFixture.profile.id, {
			label: 'Buyer home',
			street_address: 'Rue Acheteur',
			civic_number: '22B',
			city_id: catalog.actorLocations.buyer.city.id,
			province_id: catalog.actorLocations.buyer.province.id,
			postal_code: 75001,
			country_code: catalog.actorLocations.buyer.country.iso2,
			phone: '+33142345622',
			status: 'active',
		}),
		createAddressFixture(outsiderFixture.profile.id, {
			label: 'Outsider home',
			street_address: 'Kaeuferstrasse',
			civic_number: '33C',
			city_id: catalog.actorLocations.outsider.city.id,
			province_id: catalog.actorLocations.outsider.province.id,
			postal_code: 10115,
			country_code: catalog.actorLocations.outsider.country.iso2,
			phone: '+493012345633',
			status: 'active',
		}),
	]);
	const [sellerJar, buyerJar, outsiderJar] = await Promise.all([
		loginAs(sellerFixture),
		loginAs(buyerFixture),
		loginAs(outsiderFixture),
	]);

	return {
		catalog,
		seller: { ...sellerFixture, address: sellerAddress, jar: sellerJar },
		buyer: { ...buyerFixture, address: buyerAddress, jar: buyerJar },
		outsider: { ...outsiderFixture, address: outsiderAddress, jar: outsiderJar },
	};
}

export function createCommerceActors(): Promise<CommerceActorGraph> {
	const graph = graphCreationQueue.then(() => buildCommerceActors());
	graphCreationQueue = graph.then(
		() => undefined,
		() => undefined,
	);
	return graph;
}

export function validItemBody(actorGraph: CommerceActorGraph, overrides: ItemBodyOverrides = {}): createItemTypes {
	const { catalog, seller } = actorGraph;
	const body = {
		commons: {
			address_id: seller.address.id,
			description:
				'A deterministic commerce fixture item with enough detail to satisfy the complete listing description contract.',
			easy_pay: true,
			price: 12_000,
			subcategory_id: catalog.childSubcategory.id,
			title: 'Deterministic Commerce Item',
			...overrides.commons,
		},
		properties: overrides.properties ?? [
			{
				id: catalog.properties.text.id,
				slug: catalog.properties.text.slug,
				value: catalog.propertyValues.text.id,
			},
			{
				id: catalog.properties.numeric.id,
				slug: catalog.properties.numeric.slug,
				value: catalog.propertyValues.numeric.numeric_value ?? 0,
			},
			{
				id: catalog.properties.boolean.id,
				slug: catalog.properties.boolean.slug,
				value: catalog.propertyValues.boolean.boolean_value ?? false,
			},
			{
				id: catalog.delivery.property.id,
				slug: catalog.delivery.property.slug,
				value: catalog.delivery.values.easyPay.id,
			},
		],
		shipping: {
			item_height: 10,
			item_length: 20,
			item_weight: 500,
			item_width: 15,
			shipping_price: 0,
			...overrides.shipping,
		},
	} satisfies z.input<typeof createItemSchema>;

	return createItemSchema.parse(body);
}

function fixturePropertyValueIds(
	actorGraph: CommerceActorGraph,
	property: NonNullable<createItemTypes['properties']>[number],
): number[] {
	if (property.id === actorGraph.catalog.properties.numeric.id) {
		if (
			typeof property.value !== 'number' ||
			property.value !== actorGraph.catalog.propertyValues.numeric.numeric_value
		) {
			throw new Error('Commerce numeric property must use its raw numeric value');
		}
		return [actorGraph.catalog.propertyValues.numeric.id];
	}

	if (property.id === actorGraph.catalog.properties.boolean.id) {
		if (
			typeof property.value !== 'boolean' ||
			property.value !== actorGraph.catalog.propertyValues.boolean.boolean_value
		) {
			throw new Error('Commerce boolean property must use its raw boolean value');
		}
		return [actorGraph.catalog.propertyValues.boolean.id];
	}

	const values = Array.isArray(property.value) ? property.value : [property.value];
	const ids = values.map((value) => {
		if (typeof value === 'boolean' || (typeof value === 'string' && !/^\d+$/.test(value))) {
			throw new Error('Commerce select properties must use property-value IDs');
		}
		const id = Number(value);
		if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Commerce property-value ID must be positive');
		return id;
	});
	const allowedIds =
		property.id === actorGraph.catalog.properties.text.id
			? new Set([actorGraph.catalog.propertyValues.text.id])
			: property.id === actorGraph.catalog.delivery.property.id
				? new Set(Object.values(actorGraph.catalog.delivery.values).map(({ id }) => id))
				: new Set<number>();

	if (ids.some((id) => !allowedIds.has(id))) {
		throw new Error('Commerce property-value ID does not belong to its property');
	}
	return ids;
}

export async function createItemFixture(
	actorGraph: CommerceActorGraph,
	overrides: ItemBodyOverrides = {},
): Promise<SelectItem> {
	const { db } = getTestDatabase();
	const body = validItemBody(actorGraph, overrides);

	return db.transaction(async (tx) => {
		const [itemRow] = await tx
			.insert(items)
			.values({
				...body.commons,
				profile_id: actorGraph.seller.profile.id,
				published: true,
				status: itemStatus.AVAILABLE,
				custom_shipping_price: body.shipping?.shipping_price,
				item_height: body.shipping?.item_height,
				item_length: body.shipping?.item_length,
				item_weight: body.shipping?.item_weight,
				item_width: body.shipping?.item_width,
			})
			.returning();
		const item = requireInserted(itemRow, 'Item');
		const propertyRows =
			body.properties?.flatMap((property) =>
				fixturePropertyValueIds(actorGraph, property).map((propertyValueId) => ({
					item_id: item.id,
					property_value_id: propertyValueId,
				})),
			) ?? [];

		if (propertyRows.length > 0) {
			await tx.insert(items_properties_values).values(propertyRows);
		}

		return item;
	});
}

export async function createImageFixture(
	itemId: number,
	size: ItemImagesSize,
	orderPosition = 0,
): Promise<SelectItemImage> {
	const { db } = getTestDatabase();
	const [imageRow] = await db
		.insert(items_images)
		.values({
			item_id: itemId,
			order_position: orderPosition,
			size,
			url: `https://fixtures.tantovale.test/${uniqueValue('item-image')}-${size}.png`,
		})
		.returning();

	return requireInserted(imageRow, 'Item image');
}

export async function createProposalFixture(
	actorGraph: CommerceActorGraph,
	item: SelectItem,
	overrides: Partial<InsertOrderProposal> = {},
): Promise<SelectOrderProposal> {
	const { db } = getTestDatabase();
	const status = overrides.status ?? ORDER_PROPOSAL_PHASES.pending;
	let shippingQuoteId = overrides.shipping_quote_id;
	const shippingLabelId = overrides.shipping_label_id ?? uniqueValue('shipment');
	if (status === ORDER_PROPOSAL_PHASES.pending && !shippingQuoteId) {
		shippingQuoteId = randomUUID();
		await db.insert(shipping_quotes).values({
			id: shippingQuoteId,
			item_id: item.id,
			buyer_profile_id: actorGraph.buyer.profile.id,
			seller_profile_id: actorGraph.seller.profile.id,
			buyer_address_id: actorGraph.buyer.address.id,
			seller_address_id: actorGraph.seller.address.id,
			shippo_shipment_id: shippingLabelId,
			shippo_rate_id: uniqueValue('rate'),
			amount: overrides.shipping_price ?? 750,
			currency: 'EUR',
			snapshot_fingerprint: uniqueValue('fixture-quote'),
			expires_at: new Date(Date.now() + 96 * 60 * 60 * 1_000),
		});
	}
	const [proposalRow] = await db
		.insert(orders_proposals)
		.values({
			item_id: item.id,
			profile_id: actorGraph.buyer.profile.id,
			original_price: item.price,
			proposal_price: Math.max(1, item.price - 1_000),
			payment_provider_charge: 500,
			platform_charge: 600,
			shipping_label_id: shippingLabelId,
			shipping_quote_id: shippingQuoteId,
			shipping_price: overrides.shipping_price ?? 750,
			status,
			...overrides,
		})
		.returning();

	return requireInserted(proposalRow, 'Order proposal');
}

export async function createOrderFixture(
	actorGraph: CommerceActorGraph,
	item: SelectItem,
	overrides: Partial<InsertOrder> = {},
): Promise<SelectOrder> {
	const { db } = getTestDatabase();
	const creationState = overrides.payment_creation_state ?? 'created';
	const hasExplicitTransactionId = Object.prototype.hasOwnProperty.call(overrides, 'payment_transaction_id');
	const generatedTransactionId = String(
		8_000_000_000_000_000n + BigInt(Number(uniqueValue('order').match(/-(\d+)$/)?.[1] ?? 1)),
	);
	const [orderRow] = await db
		.insert(orders)
		.values({
			item_id: item.id,
			buyer_id: actorGraph.buyer.profile.id,
			seller_id: actorGraph.seller.profile.id,
			buyer_address: actorGraph.buyer.address.id,
			seller_address: actorGraph.seller.address.id,
			payment_provider_charge: 500,
			platform_charge: 600,
			shipping_label_id: uniqueValue('shipment'),
			shipping_price: item.custom_shipping_price ?? 1_250,
			item_price: item.price,
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_attempt_id: randomUUID(),
			payment_creation_state: creationState,
			payment_transaction_id: hasExplicitTransactionId
				? overrides.payment_transaction_id
				: creationState === 'created'
					? generatedTransactionId
					: null,
			...overrides,
		})
		.returning();

	return requireInserted(orderRow, 'Order');
}
