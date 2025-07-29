import { eq, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { shipmentsCreate } from 'shippo/funcs/shipmentsCreate.js';
import { shipmentsGet } from 'shippo/funcs/shipmentsGet.js';
import type { Rate, Shipment, ShipmentCreateRequest } from 'shippo/models/components/index.js';
import { transactionsCreate } from 'shippo/funcs/transactionsCreate.js';

import { createClient } from '#create-client';
import { SHIPPING_UNITS, SHIPPING_ERROR_MESSAGES } from '#utils/constants';
import { profiles, addresses, items, cities, users, shippings } from '#db-schema';

import { shippoClient } from '#lib/shippo-client';
import { itemStatus } from '#database/schemas/enumerated_values';

import type { ShipmentCalculationData } from './types';

const ERROR_MESSAGES = {
	ITEM_NOT_FOUND: 'Item not found or not available',
	BUYER_PROFILE_NOT_FOUND: 'Buyer profile not found',
	SHIPPING_DIMENSIONS_NOT_FOUND: 'Shipping dimensions not found',
} as const;

export class ShipmentService {
	private db = createClient().db;

	/**
	 * Get item data with seller information and shipping dimensions
	 */
	async getItemData(tx: any, itemId: number): Promise<ShipmentCalculationData['itemData']> {
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

				// Seller profile info
				seller_profile_id: profiles.id,
				seller_name: profiles.name,
				seller_surname: profiles.surname,
				seller_email: users.email,

				// Seller address info
				seller_street_address: addresses.street_address,
				seller_civic_number: addresses.civic_number,
				seller_city_name: cityTable.name,
				seller_province_name: provinceTable.name,
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
			.innerJoin(cityTable, eq(cityTable.id, addresses.city_id))
			.innerJoin(provinceTable, eq(provinceTable.id, addresses.province_id))
			.leftJoin(shippings, eq(shippings.item_id, items.id))
			// Get the item that is available and published
			.where(and(eq(items.id, itemId), eq(items.status, itemStatus.AVAILABLE), eq(items.published, true)));

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
	async getBuyerProfile(tx: any, profileId: number): Promise<ShipmentCalculationData['buyerProfile']> {
		const cityTable = alias(cities, 'city');
		const provinceTable = alias(cities, 'province');

		const [buyerProfile] = await tx
			.select({
				id: profiles.id,
				name: profiles.name,
				surname: profiles.surname,
				street_address: addresses.street_address,
				civic_number: addresses.civic_number,
				city_name: cityTable.name,
				province_name: provinceTable.name,
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
	): ShipmentCreateRequest {
		return {
			metadata: `seller_id: ${itemData.seller_profile_id}, buyer_id: ${buyerProfile.id}`,
			shipmentDate: new Date().toISOString(),
			addressFrom: {
				name: `${itemData.seller_name} ${itemData.seller_surname}`,
				street1: `${itemData.seller_street_address} ${itemData.seller_civic_number}`,
				streetNo: itemData.seller_civic_number,
				city: itemData.seller_province_name,
				zip: itemData.seller_postal_code.toString(),
				country: itemData.seller_country_code,
				phone: itemData.seller_phone,
				email: itemData.seller_email,
				isResidential: true,
				metadata: `profile_id: ${itemData.seller_profile_id}`,
				validate: false,
			},
			addressTo: {
				name: `${buyerProfile.name} ${buyerProfile.surname}`,
				street1: `${buyerProfile.street_address} ${buyerProfile.civic_number}`,
				streetNo: buyerProfile.civic_number,
				city: buyerProfile.province_name,
				zip: buyerProfile.postal_code.toString(),
				country: buyerProfile.country_code,
				phone: buyerProfile.phone,
				email: buyerEmail,
				isResidential: true,
				metadata: `profile_id: ${buyerProfile.id}`,
				validate: false,
			},
			parcels: [
				{
					metadata: `item_id: ${itemData.item_id}`,
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
		const shipmentLabelCreateResponse = await shipmentsCreate(shippoClient, shipmentOptions);

		if (!shipmentLabelCreateResponse.ok) {
			console.error('Shippo API error:', shipmentLabelCreateResponse.error);
			throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED);
		}

		// Currently we only support one rate per item and we are getting automatically the first one
		const rateAmount = shipmentLabelCreateResponse.value?.rates?.[0]?.amount;

		if (!rateAmount) {
			throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED);
		}

		const result = rateAmount ? parseFloat(rateAmount) : 0;

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
	): Promise<{ cost: number; rates: Rate[] }> {
		// Get shipment calculation data
		const { itemData, buyerProfile } = await this.getShipmentCalculationData(itemId, buyerProfileId);

		// Create shipment options
		const shipmentOptions = this.createShipmentOptions(itemData, buyerProfile, buyerEmail);

		// Call Shippo API
		const shipmentLabelCreateResponse = await shipmentsCreate(shippoClient, shipmentOptions);

		if (!shipmentLabelCreateResponse.ok) {
			console.error('Shippo API error:', shipmentLabelCreateResponse.error);
			throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED);
		}

		const rates = shipmentLabelCreateResponse.value?.rates ?? [];
		const rateAmount = rates[0]?.amount;

		if (!rateAmount) {
			throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED);
		}

		return {
			cost: parseFloat(rateAmount),
			rates,
		};
	}

	async getShipment(shipmentLabelId: string): Promise<Shipment> {
		const shipment = await shipmentsGet(shippoClient, shipmentLabelId);

		const shipmentData = shipment.value;

		if (!shipmentData) {
			throw new Error(SHIPPING_ERROR_MESSAGES.SHIPPING_NOT_FOUND);
		}

		return shipmentData;
	}

	/**
	 * Generate a shipment label
	 *
	 * @param rateId - The ID of the choosen rate
	 * @param orderId - The ID of the order
	 * @returns Promise<Transaction> - The transaction object
	 */
	async generateShipmentLabel(rateId: string, orderId: number) {
		const shipmentLabel = await transactionsCreate(shippoClient, {
			async: false,
			labelFileType: 'PDF',
			metadata: `order id ${orderId}`,
			order: orderId.toString(),
			rate: rateId,
		});

		if (!shipmentLabel.ok) {
			throw shipmentLabel.error;
		}

		const { value: result } = shipmentLabel;

		return result;
	}
}
