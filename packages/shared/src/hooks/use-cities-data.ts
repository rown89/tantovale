import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';

export function useCitiesData(cityName?: string) {
	const {
		data: cities,
		isLoading: isLoadingCities,
		isError: isErrorCities,
	} = useQuery({
		queryKey: ['cities-name', cityName],
		queryFn: async () => {
			if (cityName && cityName?.length > 2) {
				const res = await client.cities.search_name[':name'].$get({
					param: {
						name: cityName,
					},
				});

				if (!res.ok) return [];

				return await res.json();
			} else {
				return [];
			}
		},
	});

	return {
		cities,
		isLoadingCities,
		isErrorCities,
	};
}
