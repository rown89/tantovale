import { client } from '@workspace/server/client-rpc';

export const getPlatformsCosts = async (item_id: string, price: string) => {
	const response = await client.platforms_costs.auth.calculate.$get({
		query: {
			item_id,
			price,
		},
	});

	if (!response.ok) return [];

	const result = await response.json();

	return result;
};
