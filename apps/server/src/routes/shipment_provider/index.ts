import z from 'zod';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';

import { AddressCreateRequest, DistanceUnitEnum, ParcelCreateRequest, WeightUnitEnum } from 'shippo/models/components';
import { shipmentsCreate } from 'shippo/funcs/shipmentsCreate.js';
import { ratesGet } from 'shippo/funcs/ratesGet.js';
import { carrierAccountsList } from 'shippo/funcs/carrierAccountsList.js';

import { createRouter } from '#lib/create-app';
import { shippoClient } from '#lib/shippo-client';
import { createClient } from '#create-client';
import { activeCarriersDescription, createLabelDescription } from './describe';
import { authPath } from '#utils/constants';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { ShipmentService } from './shipment.service';

const calculateShipmentCostSchema = z.object({
	item_id: z.number().positive('Item ID must be a positive number'),
});

const ERROR_MESSAGES = {
	ITEM_NOT_FOUND: 'Item not found or not available',
	SELLER_ADDRESS_NOT_FOUND: 'Seller address not found',
	BUYER_PROFILE_NOT_FOUND: 'Buyer profile not found',
	SHIPPING_DIMENSIONS_NOT_FOUND: 'Shipping dimensions not found',
	SHIPPING_CALCULATION_FAILED: 'Failed to calculate shipping cost',
	UNAUTHORIZED_ACCESS: 'You do not have permission to access this item',
} as const;

export const shipmentProviderRoute = createRouter()
	.get(`/${authPath}/active_carriers`, authMiddleware, describeRoute(activeCarriersDescription), async (c) => {
		try {
			const res = await carrierAccountsList(shippoClient, {
				page: 1,
				results: 25,
			});

			const { value } = res;

			if (!value || !value?.results?.length) {
				return c.json({ message: 'No active carriers found' }, 404);
			}

			const activeCarriers = value.results.filter((carrier) => carrier?.active);

			return c.json({ activeCarriers }, 200);
		} catch (error) {
			console.error('Error fetching active carriers:', error);
			return c.json({ message: 'Failed to fetch active carriers' }, 500);
		}
	})
	.post(
		`/${authPath}/calculate_shipment_cost`,
		authMiddleware,
		zValidator('json', calculateShipmentCostSchema),
		async (c) => {
			try {
				const user = c.get('user');

				const { item_id } = c.req.valid('json');

				if (!user) {
					return c.json({ message: 'User not authenticated' }, 401);
				}

				const shipmentService = new ShipmentService();

				// Get all required data using the service
				const { itemData, buyerProfile } = await shipmentService.getShipmentCalculationData(item_id, user.id);

				// Create shipment options
				const shipmentOptions = shipmentService.createShipmentOptions(itemData, buyerProfile, user.email);

				// Call Shippo API
				const rates = await shipmentsCreate(shippoClient, shipmentOptions);

				if (!rates.ok) {
					console.error('Shippo API error:', rates.error);
					return c.json({ message: ERROR_MESSAGES.SHIPPING_CALCULATION_FAILED }, 500);
				}

				return c.json({ rates: rates.value?.rates ?? [] }, 200);
			} catch (error) {
				console.error('Error calculating shipment cost:', error);

				if (error instanceof Error) {
					const errorMessage = error.message;
					if (Object.values(ERROR_MESSAGES).includes(errorMessage as any)) {
						return c.json({ message: errorMessage }, 400);
					}
				}

				return c.json({ message: 'Internal server error' }, 500);
			}
		},
	)
	.post(`/${authPath}/create_label`, describeRoute(createLabelDescription), async (c) => {
		const rates = await ratesGet(shippoClient, '377cad39afe049ac959063bb3b251a50');

		const { db } = createClient();

		const addressFrom: AddressCreateRequest = {
			name: 'Shawn Ippotle',
			street1: '215 Clayton St.',
			city: 'San Francisco',
			state: 'CA',
			zip: '94117',
			country: 'US',
		};

		const addressTo: AddressCreateRequest = {
			name: 'Mr Hippo',
			street1: 'Broadway 1',
			city: 'New York',
			state: 'NY',
			zip: '10007',
			country: 'US',
		};

		const parcel: ParcelCreateRequest = {
			length: '5',
			width: '5',
			height: '5',
			distanceUnit: DistanceUnitEnum.Cm,
			weight: '2',
			massUnit: WeightUnitEnum.G,
		};

		const shipment = await shipmentsCreate(shippoClient, {
			addressFrom,
			addressTo,
			parcels: [parcel],
			async: false,
		});

		return c.json({ rates: [] });
	});
