import type { Hono } from 'hono';
import z from 'zod';
import { describeRoute } from 'hono-openapi';
import { eq } from 'drizzle-orm';

import { ratesGet } from 'shippo/funcs/ratesGet.js';
import { carrierAccountsList } from 'shippo/funcs/carrierAccountsList.js';
import {
	AddressCreateRequest,
	DistanceUnitEnum,
	ParcelCreateRequest,
	ShipmentCreateRequest,
	WeightUnitEnum,
} from 'shippo/models/components';
import { shipmentsCreate } from 'shippo/funcs/shipmentsCreate.js';

import { createClient } from '../../database';
import type { AppBindings } from '../../lib/types';
import { createRouter } from '../../lib/create-app';
import { shippoClient } from '../../lib/shippo-client';
import { activeCarriersDescription, createLabelDescription } from './describe';
import { zValidator } from '@hono/zod-validator';
import { profiles } from 'src/database/schemas/profiles';
import { addresses } from 'src/database/schemas/addresses';
import { items } from 'src/database/schemas/items';

const requestSchema = z.object({
	item_id: z.number(),
	parcel: z.object({
		length: z.number(),
		width: z.number(),
		height: z.number(),
		weight: z.number(),
	}),
});

export const shipmentProviderRoute: Hono<AppBindings> = createRouter()
	.get('/active-carriers', describeRoute(activeCarriersDescription), async (c) => {
		const res = await carrierAccountsList(shippoClient, {
			page: 1,
			results: 25,
		});

		if (!res.ok) {
			return c.json({ error: res.error }, 500);
		}

		const { value: result } = res;

		const activeCarriers = result?.results?.filter((carrier) => carrier.active) ?? [];

		return c.json({ carriers: activeCarriers });
	})
	.post('/calculate-shipment-cost', zValidator('json', requestSchema), async (c) => {
		const user = c.get('user');

		const { item_id, parcel } = c.req.valid('json');

		const { db } = createClient();

		let shipmentOptions: ShipmentCreateRequest;

		await db.transaction(async (tx) => {
			const [item] = await tx
				.select({
					user_id: items.user_id,
					profile_id: profiles.id,
					name: profiles.name,
					surname: profiles.surname,
				})
				.from(items)
				.innerJoin(profiles, eq(items.user_id, profiles.user_id))
				.where(eq(items.id, item_id));

			if (!item) throw new Error('Item not found');

			// get profile id from buyer_id
			const [buyer_profile] = await tx
				.select({
					id: profiles.id,
				})
				.from(profiles)
				.where(eq(profiles.user_id, user.id));

			if (!buyer_profile) throw new Error('Profile not found');

			shipmentOptions = {
				metadata: `buyer_id: ${buyer_profile.id}, seller_id: ${item.profile_id}`,
				shipmentDate: new Date().toISOString(),
				addressFrom: {
					name: `${item.name} ${item.surname}`,
					street1: '215 Clayton St.',
					streetNo: '',
					city: 'San Francisco',
					state: 'CA',
					zip: '94117',
					country: 'US',
					phone: '+1 555 341 9393',
					email: 'shippotle@shippo.com',
					isResidential: true,
					metadata: 'Customer ID 123456',
					validate: true,
				},
				addressTo: {
					name: 'Shwan Ippotle',
					company: 'Shippo',
					street1: '215 Clayton St.',
					street3: '',
					streetNo: '',
					city: 'San Francisco',
					state: 'CA',
					zip: '94117',
					country: 'US',
					phone: '+1 555 341 9393',
					email: 'shippotle@shippo.com',
					isResidential: true,
					metadata: `profile_id: ${buyer_profile.id}`,
					validate: true,
				},
				parcels: [
					{
						metadata: 'Customer ID 123456',
						massUnit: 'kg',
						weight: '1',
						distanceUnit: 'cm',
						height: '1',
						length: '1',
						width: '1',
					},
				],
			};
		});

		const rates = await shipmentsCreate(shippoClient, shipmentOptions);

		return c.json({ rates });
	})
	.post('/create-label', describeRoute(createLabelDescription), async (c) => {
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
