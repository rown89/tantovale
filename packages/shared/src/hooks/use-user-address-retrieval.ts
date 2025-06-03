import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';

export function useAddressesRetrieval({ status }: { status?: 'active' | 'inactive' | 'deleted' } = {}) {
	const {
		data: userAddress,
		isLoading: isUserAddressLoading,
		isError: isUserAddressError,
	} = useQuery({
		queryKey: ['userAddress'],
		queryFn: async () => {
			const addressesResponse = await client.addresses.auth.addresses_profile.$get();

			const addresses = await addressesResponse.json();

			if (!addressesResponse.ok) {
				throw new Error('Failed to fenumbertch user address');
			}

			if ('message' in addresses) {
				throw new Error(addresses.message);
			}

			return addresses;
		},
	});

	const {
		data: userAddressByStatus,
		isLoading: isUserAddressByStatusLoading,
		isError: isUserAddressByStatusError,
	} = useQuery({
		queryKey: ['userAddressByStatus', status],
		queryFn: async () => {
			if (status) {
				const addressesResponse = await client.addresses.auth.addresses_profile_by_status.$get({
					query: {
						status: status,
					} as const,
				});

				const addresses = await addressesResponse.json();

				if (!addressesResponse.ok) {
					throw new Error('Failed to fetch user address by status');
				}

				return addresses;
			}

			return null;
		},
	});

	return {
		userAddress,
		isUserAddressLoading,
		isUserAddressError,
		userAddressByStatus,
		isUserAddressByStatusLoading,
		isUserAddressByStatusError,
	};
}
