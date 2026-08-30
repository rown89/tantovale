import type { z } from 'zod/v4';
import { and, eq, inArray } from 'drizzle-orm';

import {
	items,
	items_images,
	items_properties_values,
	orders,
	orders_proposals,
	subcategories,
	users,
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
import { hashPassword } from '../../src/lib/password';
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

function requireInserted<Row>(row: Row | undefined, label: string): Row {
	if (!row) {
		throw new Error(`${label} fixture insert failed`);
	}

	return row;
}

export async function createCommerceActors(): Promise<CommerceActorGraph> {
	const { db } = getTestDatabase();
	let catalog = reusableCatalog;
	if (catalog) {
		const [storedCatalog] = await db
			.select({ id: subcategories.id })
			.from(subcategories)
			.where(
				and(eq(subcategories.id, catalog.childSubcategory.id), eq(subcategories.slug, catalog.childSubcategory.slug)),
			)
			.limit(1);

		if (!storedCatalog) {
			catalog = undefined;
		}
	}
	if (!catalog) {
		catalog = await createCatalogFixture();
		reusableCatalog = catalog;
	}

	const spacerPassword = await hashPassword('StrongPass123!');
	await db.transaction(async (tx) => {
		const spacerUsers = await tx
			.insert(users)
			.values(
				Array.from({ length: 3 }, () => {
					const spacer = uniqueValue('identity-spacer');
					return {
						username: spacer,
						email: `${spacer}@tantovale.test`,
						password: spacerPassword,
						email_verified: true,
					};
				}),
			)
			.returning();
		if (spacerUsers.length !== 3) {
			throw new Error('Identity spacer user fixture insert failed');
		}
		await tx.delete(users).where(
			inArray(
				users.id,
				spacerUsers.map(({ id }) => id),
			),
		);
	});

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
