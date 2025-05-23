import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';
import { useState } from 'react';

interface LocationTypes {
	id: number;
	name: string;
	state_code: string | null;
}

export function useLocationData(
	locationType: 'city' | 'province' | 'postal_code',
	locationName?: string,
	locationStateCode?: string,
) {
	const [cities, setCities] = useState<LocationTypes[]>([]);
	const [provinces, setProvinces] = useState<LocationTypes[]>([]);

	const {
		data: locations,
		isLoading: isLoadingLocations,
		isError: isErrorLocations,
	} = useQuery({
		queryKey: [locationType, locationName],
		queryFn: async () => {
			if (locationName && locationName?.length > 2) {
				const response = await client.locations.search.$get({
					query: {
						locationType,
						locationName,
						locationStateCode,
					},
				});

				if (!response.ok) return [];

				const result = await response.json();

				if (!result) return [];

				if (locationType === 'city') {
					setCities(result);
				} else if (locationType === 'province') {
					setProvinces(result);
				}

				return result;
			}

			return [];
		},
	});

	return {
		cities,
		provinces,
		isLoadingLocations,
		isErrorLocations,
	};
}
