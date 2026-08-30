import type { z } from 'zod/v4';
import { eq, inArray } from 'drizzle-orm';

import {
	categories,
	cities,
	countries,
	items,
	items_images,
	items_properties_values,
	orders,
	orders_proposals,
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
import { createCatalogFixture, type CatalogFixture } from './catalog';
import { createUserFixture, type UserFixture, uniqueValue } from './factories';

type CommerceActor = UserFixture & { jar: CookieJar; address: SelectAddress };

export type CommerceActorGraph = {
	seller: CommerceActor;
	buyer: CommerceActor;
	outsider: CommerceActor;
	catalog: CatalogFixture;
};

type ItemBodyOverrides = {
	commons?: Partial<createItemTypes['commons']>;
	shipping?: Partial<NonNullable<createItemTypes['shipping']>>;
	properties?: createItemTypes['properties'];
};

let reusableCatalog: CatalogFixture | undefined;
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

async function resolveCatalogFixture(): Promise<CatalogFixture> {
	const { db } = getTestDatabase();
	const cached = reusableCatalog;
	if (!cached) {
		const created = await createCatalogFixture();
		reusableCatalog = created;
		return created;
	}

	const expectedCategories = [cached.publishedCategory, cached.unpublishedCategory];
	const expectedSubcategories = [cached.parentSubcategory, cached.childSubcategory, cached.unpublishedSubcategory];
	const expectedProperties = [...Object.values(cached.properties), cached.unpublishedMapping.property];
	const expectedMappings = [...Object.values(cached.mappings), cached.unpublishedMapping.mapping];
	const expectedPropertyValues = [...Object.values(cached.propertyValues), cached.unpublishedMapping.propertyValue];
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
		db.select().from(countries).where(eq(countries.id, cached.country.id)),
		db.select().from(states).where(eq(states.id, cached.state.id)),
		db.select().from(cities).where(eq(cities.id, cached.city.id)),
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
		const created = await createCatalogFixture();
		reusableCatalog = created;
		return created;
	}

	const catalogIsComplete =
		fixtureRowsMatch(countryRows, [cached.country], ['id', 'name', 'iso3', 'iso2', 'phonecode']) &&
		fixtureRowsMatch(stateRows, [cached.state], ['id', 'name', 'country_id', 'country_code', 'state_code']) &&
		fixtureRowsMatch(
			cityRows,
			[cached.city],
			['id', 'name', 'state_id', 'state_code', 'country_id', 'country_code', 'latitude', 'longitude'],
		) &&
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
		createAddressFixture(sellerFixture.profile.id, { label: 'Seller home', status: 'active' }),
		createAddressFixture(buyerFixture.profile.id, { label: 'Buyer home', status: 'active' }),
		createAddressFixture(outsiderFixture.profile.id, { label: 'Outsider home', status: 'active' }),
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
				value: catalog.propertyValues.numeric.id,
			},
			{
				id: catalog.properties.boolean.id,
				slug: catalog.properties.boolean.slug,
				value: catalog.propertyValues.boolean.id,
			},
		],
		shipping: {
			item_height: 10,
			item_length: 20,
			item_weight: 500,
			item_width: 15,
			shipping_price: 1_250,
			...overrides.shipping,
		},
	} satisfies z.input<typeof createItemSchema>;

	return createItemSchema.parse(body);
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
			body.properties?.flatMap(({ value }) =>
				(Array.isArray(value) ? value : [value]).map((propertyValueId) => ({
					item_id: item.id,
					property_value_id: Number(propertyValueId),
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
	const [proposalRow] = await db
		.insert(orders_proposals)
		.values({
			item_id: item.id,
			profile_id: actorGraph.buyer.profile.id,
			original_price: item.price,
			proposal_price: Math.max(1, item.price - 1_000),
			payment_provider_charge: 500,
			platform_charge: 600,
			shipping_label_id: uniqueValue('shipment'),
			status: ORDER_PROPOSAL_PHASES.pending,
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
			status: ORDER_PHASES.PAYMENT_PENDING,
			...overrides,
		})
		.returning();

	return requireInserted(orderRow, 'Order');
}
