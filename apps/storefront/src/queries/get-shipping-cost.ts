import { client } from '@workspace/server/client-rpc';
import { CarrierAccountWithExtraInfo } from 'shippo/models/components/index.js';

export const getShippingCarriers = async (): Promise<CarrierAccountWithExtraInfo[]> => {
	const carriersResponse = await client.shipment_provider.auth.active_carriers.$get();

	if (!carriersResponse.ok) return [];

	const { activeCarriers } = await carriersResponse.json();

	return activeCarriers;
};

export const getShippingCost = async (item_id: number) => {
	const ratesResponse = await client.shipment_provider.auth.calculate_shipment_cost.$post({
		json: {
			item_id,
		},
	});

	if (!ratesResponse.ok) {
		return undefined;
	}

	const { rates } = await ratesResponse.json();

	const firstRate = rates?.[0];

	if (!firstRate) {
		return undefined;
	}

	return {
		...firstRate,
		amount: firstRate.amount ? parseFloat(firstRate.amount) : undefined,
	};
};
