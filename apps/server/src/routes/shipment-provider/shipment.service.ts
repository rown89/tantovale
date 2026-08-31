import { createHash, randomUUID } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { shipmentsCreate } from 'shippo/funcs/shipmentsCreate.js';
import { shipmentsGet } from 'shippo/funcs/shipmentsGet.js';
import { carrierAccountsList } from 'shippo/funcs/carrierAccountsList.js';
import { ratesGet } from 'shippo/funcs/ratesGet.js';
import { transactionsCreate } from 'shippo/funcs/transactionsCreate.js';
import z from 'zod/v4';

import { createClient } from '#create-client';
import { SHIPPING_UNITS, SHIPPING_ERROR_MESSAGES } from '#utils/constants';
import {
	profiles,
	addresses,
	items,
	cities,
	users,
	shippings,
	categories,
	subcategories,
	shipping_quotes,
} from '#db-schema';

import { shippoClient } from '#lib/shippo-client';

import type { Rate, Shipment, ShipmentCreateRequest } from 'shippo/models/components/index.js';
import type { ShipmentCalculationData } from './types';
import { itemStatus } from '#database/schemas/enumerated_values';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';

const ERROR_MESSAGES = {
	ITEM_NOT_FOUND: 'Item not found or not available',
	BUYER_PROFILE_NOT_FOUND: 'Buyer profile not found',
	SHIPPING_DIMENSIONS_NOT_FOUND: 'Shipping dimensions not found',
} as const;

export type ShippoOperation = 'list_carriers' | 'create_shipment' | 'get_shipment' | 'get_rate' | 'create_label';
export type ShippoErrorCategory = 'http' | 'invalid_response' | 'network';

export class ShippoProviderError extends Error {
	readonly provider = 'shippo' as const;

	constructor(
		readonly operation: ShippoOperation,
		readonly category: ShippoErrorCategory,
		readonly status?: number,
	) {
		super('Shipping provider request failed');
		this.name = 'ShippoProviderError';
	}
}

const carrierAccountSchema = z.object({
	accountId: z.string().min(1),
	active: z.boolean(),
	carrier: z.string().min(1),
});

const carrierAccountsSchema = z.object({ results: z.array(carrierAccountSchema) });
const rateSchema = z.object({
	objectId: z.string().min(1),
	shipment: z.string().min(1),
	amount: z.string().min(1),
	currency: z.string().min(1),
});
const labelTransactionSchema = z.object({
	objectId: z.string().min(1),
	status: z.literal('SUCCESS'),
	labelUrl: z.string().url(),
	rate: z.union([z.string().min(1), z.object({ objectId: z.string().min(1) }).passthrough()]),
	trackingNumber: z.string().min(1).nullish(),
	trackingUrlProvider: z.string().url().nullish(),
});

function shippoErrorStatus(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
	const status = error.statusCode;
	return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

function shippoErrorCategory(error: unknown): ShippoErrorCategory {
	const name = error instanceof Error ? error.name : '';
	if (name === 'SDKValidationError' || name === 'UnexpectedClientError') return 'invalid_response';
	return shippoErrorStatus(error) === undefined ? 'network' : 'http';
}

async function executeShippoRequest<T>(
	operation: ShippoOperation,
	request: () => Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
): Promise<T> {
	try {
		const result = await request();
		if (!result.ok) {
			throw new ShippoProviderError(operation, shippoErrorCategory(result.error), shippoErrorStatus(result.error));
		}
		return result.value;
	} catch (error) {
		if (error instanceof ShippoProviderError) throw error;
		throw new ShippoProviderError(operation, 'network');
	}
}

type DatabaseQuery = Pick<ReturnType<typeof createClient>['db'], 'select'>;

const shippingQuoteTtlMs = 15 * 60 * 1_000;
const postgresIntegerMax = 2_147_483_647n;

export function parseProviderDecimalToCents(amount: string): number | undefined {
	const match = /^(\d+)(?:\.(\d+))?$/.exec(amount);
	if (!match) return undefined;
	const fraction = match[2] ?? '';
	if (fraction.length > 2 && /[^0]/.test(fraction.slice(2))) return undefined;
	const cents = BigInt(match[1]!) * 100n + BigInt((fraction.slice(0, 2) + '00').slice(0, 2));
	return cents > 0n && cents <= postgresIntegerMax ? Number(cents) : undefined;
}

export function shippingSnapshotFingerprint({ itemData, buyerProfile }: ShipmentCalculationData): string {
	const canonical = [
		'v1',
		itemData.item_id,
		itemData.item_profile_id,
		itemData.item_address_id,
		itemData.item_status,
		itemData.item_published,
		itemData.item_easy_pay,
		itemData.item_subcategory_id,
		itemData.category_id,
		itemData.seller_address_id,
		itemData.seller_city_id,
		itemData.seller_province_id,
		itemData.seller_street_address,
		itemData.seller_civic_number,
		itemData.seller_city_name,
		itemData.seller_province_name,
		itemData.seller_province_code,
		itemData.seller_country_code,
		itemData.seller_postal_code,
		itemData.seller_phone,
		itemData.item_weight,
		itemData.item_length,
		itemData.item_width,
		itemData.item_height,
		buyerProfile.id,
		buyerProfile.address_id,
		buyerProfile.city_id,
		buyerProfile.province_id,
		buyerProfile.street_address,
		buyerProfile.civic_number,
		buyerProfile.city_name,
		buyerProfile.province_name,
		buyerProfile.province_code,
		buyerProfile.country_code,
		buyerProfile.postal_code,
		buyerProfile.phone,
	];
	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function shipmentMatchesShippingState(shipment: Shipment, state: ShipmentCalculationData): boolean {
	const { itemData, buyerProfile } = state;
	const [parcel] = shipment.parcels;
	return (
		shipment.addressFrom.street1 === `${itemData.seller_street_address} ${itemData.seller_civic_number}` &&
		shipment.addressFrom.city === itemData.seller_city_name &&
		shipment.addressFrom.state === itemData.seller_province_code &&
		shipment.addressFrom.zip === itemData.seller_postal_code.toString() &&
		shipment.addressFrom.country === itemData.seller_country_code &&
		shipment.addressFrom.phone === itemData.seller_phone &&
		shipment.addressTo.street1 === `${buyerProfile.street_address} ${buyerProfile.civic_number}` &&
		shipment.addressTo.city === buyerProfile.city_name &&
		shipment.addressTo.state === buyerProfile.province_code &&
		shipment.addressTo.zip === buyerProfile.postal_code.toString() &&
		shipment.addressTo.country === buyerProfile.country_code &&
		shipment.addressTo.phone === buyerProfile.phone &&
		parcel?.massUnit === SHIPPING_UNITS.MASS &&
		parcel.distanceUnit === SHIPPING_UNITS.DISTANCE &&
		parcel.weight === String(itemData.item_weight) &&
		parcel.height === String(itemData.item_height) &&
		parcel.length === String(itemData.item_length) &&
		parcel.width === String(itemData.item_width)
	);
}

export class ShipmentService {
	private db = createClient().db;

	async listActiveCarriers() {
		const value = await executeShippoRequest('list_carriers', () =>
			carrierAccountsList(shippoClient, { page: 1, results: 25 }),
		);
		const parsed = carrierAccountsSchema.safeParse(value);
		if (!parsed.success) throw new ShippoProviderError('list_carriers', 'invalid_response');
		return parsed.data.results.filter((carrier) => carrier.active);
	}

	async verifyRateForPurchase(expectation: { rateId: string; shipmentId: string; amount: number; currency: 'EUR' }) {
		const rateValue = await executeShippoRequest('get_rate', () => ratesGet(shippoClient, expectation.rateId));
		const rate = rateSchema.safeParse(rateValue);
		if (!rate.success) throw new ShippoProviderError('get_rate', 'invalid_response');
		const amount = parseProviderDecimalToCents(rate.data.amount);
		if (
			rate.data.objectId !== expectation.rateId ||
			rate.data.shipment !== expectation.shipmentId ||
			amount !== expectation.amount ||
			rate.data.currency !== expectation.currency
		) {
			throw new ShippoProviderError('get_rate', 'invalid_response');
		}
		return rate.data;
	}

	async purchaseVerifiedLabel(rateId: string) {
		const transactionValue = await executeShippoRequest('create_label', () =>
			transactionsCreate(shippoClient, { rate: rateId, async: false, labelFileType: 'PDF' }),
		);
		const transaction = labelTransactionSchema.safeParse(transactionValue);
		if (!transaction.success) throw new ShippoProviderError('create_label', 'invalid_response');
		const purchasedRateId =
			typeof transaction.data.rate === 'string' ? transaction.data.rate : transaction.data.rate.objectId;
		if (purchasedRateId !== rateId) throw new ShippoProviderError('create_label', 'invalid_response');
		return transaction.data;
	}

	/**
	 * Get item data with seller information and shipping dimensions
	 */
	async getItemData(tx: DatabaseQuery, itemId: number): Promise<ShipmentCalculationData['itemData']> {
		const cityTable = alias(cities, 'city');
		const provinceTable = alias(cities, 'province');

		const [itemData] = await tx
			.select({
				// Item info
				item_id: items.id,
				item_profile_id: items.profile_id,
				item_address_id: items.address_id,
				item_status: items.status,
				item_published: items.published,
				item_easy_pay: items.easy_pay,
				item_subcategory_id: items.subcategory_id,
				category_id: subcategories.category_id,

				// Seller profile info
				seller_profile_id: profiles.id,
				seller_name: profiles.name,
				seller_surname: profiles.surname,
				seller_email: users.email,

				// Seller address info
				seller_street_address: addresses.street_address,
				seller_address_id: addresses.id,
				seller_city_id: addresses.city_id,
				seller_province_id: addresses.province_id,
				seller_civic_number: addresses.civic_number,
				seller_city_name: cityTable.name,
				seller_province_name: provinceTable.name,
				seller_province_code: provinceTable.state_code,
				seller_country_code: addresses.country_code,
				seller_postal_code: addresses.postal_code,
				seller_phone: addresses.phone,

				// Shipping dimensions
				item_weight: items.item_weight,
				item_length: items.item_length,
				item_width: items.item_width,
				item_height: items.item_height,
			})
			.from(items)
			.innerJoin(profiles, eq(items.profile_id, profiles.id))
			.innerJoin(users, eq(profiles.user_id, users.id))
			// Get the seller address that is associated with the item
			.innerJoin(addresses, and(eq(addresses.profile_id, profiles.id), eq(addresses.id, items.address_id)))
			.innerJoin(subcategories, and(eq(subcategories.id, items.subcategory_id), eq(subcategories.published, true)))
			.innerJoin(categories, and(eq(categories.id, subcategories.category_id), eq(categories.published, true)))
			.innerJoin(cityTable, eq(cityTable.id, addresses.city_id))
			.innerJoin(provinceTable, eq(provinceTable.id, addresses.province_id))
			.leftJoin(shippings, eq(shippings.item_id, items.id))
			// Get the item that is available and published
			.where(
				and(
					eq(items.id, itemId),
					eq(items.status, itemStatus.AVAILABLE),
					eq(items.published, true),
					eq(items.easy_pay, true),
					isNull(items.deleted_at),
					eq(addresses.status, 'active'),
				),
			);

		if (!itemData) {
			throw new Error(ERROR_MESSAGES.ITEM_NOT_FOUND);
		}

		// Validate shipping dimensions exist
		if (!itemData.item_weight || !itemData.item_length || !itemData.item_width || !itemData.item_height) {
			throw new Error(ERROR_MESSAGES.SHIPPING_DIMENSIONS_NOT_FOUND);
		}

		return itemData;
	}

	/**
	 * Get buyer profile and address information
	 */
	async getBuyerProfile(tx: DatabaseQuery, profileId: number): Promise<ShipmentCalculationData['buyerProfile']> {
		const cityTable = alias(cities, 'city');
		const provinceTable = alias(cities, 'province');

		const [buyerProfile] = await tx
			.select({
				id: profiles.id,
				address_id: addresses.id,
				city_id: addresses.city_id,
				province_id: addresses.province_id,
				name: profiles.name,
				surname: profiles.surname,
				street_address: addresses.street_address,
				civic_number: addresses.civic_number,
				city_name: cityTable.name,
				province_name: provinceTable.name,
				province_code: provinceTable.state_code,
				country_code: addresses.country_code,
				postal_code: addresses.postal_code,
				phone: addresses.phone,
			})
			.from(profiles)
			.innerJoin(addresses, eq(addresses.profile_id, profiles.id))
			.innerJoin(cityTable, eq(cityTable.id, addresses.city_id))
			.innerJoin(provinceTable, eq(provinceTable.id, addresses.province_id))
			.where(and(eq(profiles.id, profileId), eq(addresses.status, 'active')));

		if (!buyerProfile) {
			throw new Error(ERROR_MESSAGES.BUYER_PROFILE_NOT_FOUND);
		}

		return buyerProfile;
	}

	/**
	 * Create shipment options for Shippo API
	 */
	createShipmentOptions(
		itemData: ShipmentCalculationData['itemData'],
		buyerProfile: ShipmentCalculationData['buyerProfile'],
		buyerEmail: string,
		metadata?: string,
	): ShipmentCreateRequest {
		return {
			async: false,
			metadata: metadata ?? 'Tantovale shipping preview',
			shipmentDate: new Date().toISOString(),
			addressFrom: {
				name: `${itemData.seller_name} ${itemData.seller_surname}`,
				street1: `${itemData.seller_street_address} ${itemData.seller_civic_number}`,
				streetNo: itemData.seller_civic_number,
				city: itemData.seller_city_name,
				state: itemData.seller_province_code,
				zip: itemData.seller_postal_code.toString(),
				country: itemData.seller_country_code,
				phone: itemData.seller_phone,
				email: itemData.seller_email,
				isResidential: true,
				validate: false,
			},
			addressTo: {
				name: `${buyerProfile.name} ${buyerProfile.surname}`,
				street1: `${buyerProfile.street_address} ${buyerProfile.civic_number}`,
				streetNo: buyerProfile.civic_number,
				city: buyerProfile.city_name,
				state: buyerProfile.province_code,
				zip: buyerProfile.postal_code.toString(),
				country: buyerProfile.country_code,
				phone: buyerProfile.phone,
				email: buyerEmail,
				isResidential: true,
				validate: false,
			},
			parcels: [
				{
					massUnit: SHIPPING_UNITS.MASS,
					distanceUnit: SHIPPING_UNITS.DISTANCE,
					weight: String(itemData.item_weight),
					height: String(itemData.item_height),
					length: String(itemData.item_length),
					width: String(itemData.item_width),
				},
			],
		};
	}

	async createShippingQuote(itemId: number, buyerProfileId: number, buyerEmail: string, checkoutAttemptId?: string) {
		const quoteId = randomUUID();
		const initial = await this.getShipmentCalculationData(itemId, buyerProfileId);
		if (initial.itemData.seller_profile_id === buyerProfileId) throw new Error(ERROR_MESSAGES.ITEM_NOT_FOUND);
		const fingerprint = shippingSnapshotFingerprint(initial);
		const responseValue = await executeShippoRequest('create_shipment', () =>
			shipmentsCreate(
				shippoClient,
				this.createShipmentOptions(initial.itemData, initial.buyerProfile, buyerEmail, `tvq1:${quoteId}`),
			),
		);
		if (
			responseValue.status !== 'SUCCESS' ||
			responseValue.metadata !== `tvq1:${quoteId}` ||
			!shipmentMatchesShippingState(responseValue, initial)
		) {
			throw new ShippoProviderError('create_shipment', 'invalid_response');
		}
		const shipmentId = responseValue.objectId;
		const validRates = responseValue.rates
			?.filter((candidate) => {
				const cents = candidate.amount ? parseProviderDecimalToCents(candidate.amount) : undefined;
				return (
					Boolean(candidate.objectId) &&
					candidate.shipment === shipmentId &&
					candidate.currency === 'EUR' &&
					cents !== undefined &&
					Number.isSafeInteger(cents) &&
					cents > 0
				);
			})
			.sort((left, right) => left.objectId.localeCompare(right.objectId));
		const rate = validRates?.find((candidate) => candidate.attributes?.includes('BESTVALUE')) ?? validRates?.[0];
		const amount = rate?.amount ? parseProviderDecimalToCents(rate.amount) : undefined;
		if (
			!shipmentId ||
			!rate?.objectId ||
			rate.shipment !== shipmentId ||
			rate.currency !== 'EUR' ||
			amount === undefined ||
			!Number.isSafeInteger(amount) ||
			amount <= 0
		) {
			throw new ShippoProviderError('create_shipment', 'invalid_response');
		}

		const expiresAt = new Date(Date.now() + shippingQuoteTtlMs);
		await this.db.transaction(async (tx) => {
			await acquireItemCommerceLock(tx, itemId);
			const current = {
				itemData: await this.getItemData(tx, itemId),
				buyerProfile: await this.getBuyerProfile(tx, buyerProfileId),
			};
			if (shippingSnapshotFingerprint(current) !== fingerprint) {
				throw new Error('Shipping inputs changed while calculating the quote');
			}
			await tx.insert(shipping_quotes).values({
				id: quoteId,
				checkout_attempt_id: checkoutAttemptId,
				item_id: itemId,
				buyer_profile_id: buyerProfileId,
				seller_profile_id: initial.itemData.seller_profile_id,
				buyer_address_id: initial.buyerProfile.address_id,
				seller_address_id: initial.itemData.seller_address_id,
				shippo_shipment_id: shipmentId,
				shippo_rate_id: rate.objectId,
				amount,
				currency: rate.currency,
				snapshot_fingerprint: fingerprint,
				expires_at: expiresAt,
			});
		});

		return { amount: rate.amount, currency: rate.currency, shipment_label_id: shipmentId, shipping_quote_id: quoteId };
	}

	/**
	 * Get all shipment calculation data in a transaction
	 */
	async getShipmentCalculationData(itemId: number, profileId: number): Promise<ShipmentCalculationData> {
		return await this.db.transaction(async (tx) => {
			const itemData = await this.getItemData(tx, itemId);
			const buyerProfile = await this.getBuyerProfile(tx, profileId);

			return { itemData, buyerProfile };
		});
	}

	/**
	 * Calculate shipping cost for an item and buyer
	 * This method wraps all shipping calculation logic in a single point
	 *
	 * @param itemId - The ID of the item to calculate shipping for
	 * @param buyerProfileId - The ID of the buyer's profile
	 * @param buyerEmail - The buyer's email address
	 * @returns Promise<number> - The calculated shipping cost
	 *
	 * @example
	 * ```typescript
	 * const shipmentService = new ShipmentService();
	 * const shippingCost = await shipmentService.calculateShippingCost(itemId, profileId, buyerEmail);
	 * ```
	 */
	async calculateShippingCost(itemId: number, buyerProfileId: number, buyerEmail: string) {
		// Get shipment calculation data
		const { itemData, buyerProfile } = await this.getShipmentCalculationData(itemId, buyerProfileId);

		// Create shipment options
		const shipmentOptions = this.createShipmentOptions(itemData, buyerProfile, buyerEmail);

		// Call Shippo API
		const shipment = await executeShippoRequest('create_shipment', () =>
			shipmentsCreate(shippoClient, shipmentOptions),
		);

		const rateAmount = shipment.rates?.[0]?.amount;

		if (!rateAmount) {
			throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED);
		}

		const cents = parseProviderDecimalToCents(rateAmount);
		if (cents === undefined) throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED);
		const result = cents / 100;

		return result;
	}

	/**
	 * Calculate shipping cost and return both cost and rates for an item and buyer
	 * This method wraps all shipping calculation logic in a single point and returns both values
	 *
	 * @param itemId - The ID of the item to calculate shipping for
	 * @param buyerProfileId - The ID of the buyer's profile
	 * @param buyerEmail - The buyer's email address
	 * @returns Promise<{ cost: number; rates: any[] }> - Object containing the calculated shipping cost and available rates
	 *
	 * @example
	 * ```typescript
	 * const shipmentService = new ShipmentService();
	 * const { cost, rates } = await shipmentService.calculateShippingCostWithRates(itemId, profileId, buyerEmail);
	 * ```
	 */
	async calculateShippingCostWithRates(
		itemId: number,
		buyerProfileId: number,
		buyerEmail: string,
		query?: DatabaseQuery,
	): Promise<{ cost: number; rates: Rate[] }> {
		// Get shipment calculation data
		const { itemData, buyerProfile } = query
			? {
					itemData: await this.getItemData(query, itemId),
					buyerProfile: await this.getBuyerProfile(query, buyerProfileId),
				}
			: await this.getShipmentCalculationData(itemId, buyerProfileId);

		// Create shipment options
		const shipmentOptions = this.createShipmentOptions(itemData, buyerProfile, buyerEmail);

		// Call Shippo API
		const shipment = await executeShippoRequest('create_shipment', () =>
			shipmentsCreate(shippoClient, shipmentOptions),
		);

		const rates = shipment.rates ?? [];
		const rateAmount = rates[0]?.amount;

		if (!rateAmount) {
			throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED);
		}

		const cents = parseProviderDecimalToCents(rateAmount);
		if (cents === undefined) throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED);
		return {
			cost: cents / 100,
			rates,
		};
	}

	async getShippingLabel(shipmentLabelId: string) {
		return executeShippoRequest('get_shipment', () => shipmentsGet(shippoClient, shipmentLabelId));
	}
}
