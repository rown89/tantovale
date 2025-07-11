import { client } from '@workspace/server/client-rpc';

export const getPlatformsCosts = async (price: number, shipping_price: number) => {
	try {
		const response = await client.platforms_costs.auth.calculate_platform_costs.$post({
			json: {
				price,
				shipping_price,
			},
		});

		if (!response.ok) {
			throw new Error('Failed to get platforms costs');
		}

		const result = await response.json();

		return result;
	} catch (error) {
		return null;
	}
};
