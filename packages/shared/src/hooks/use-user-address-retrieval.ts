import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';

export function useAddressesRetrieval({
	status,
	enabled = true,
}: { status?: 'active' | 'inactive' | 'deleted'; enabled?: boolean } = {}) {
	const {
		data: userAddress,
		isLoading: isUserAddressLoading,
		isError: isUserAddressError,
	} = useQuery({
		queryKey: ['userAddress', status],
		enabled,
		queryFn: async () => {
			const addressesResponse = await client.addresses.auth.addresses_profile.$get();

			const addresses = await addressesResponse.json();

			if (!addressesResponse.ok) {
				throw new Error('Failed to fenumbertch user address');
			}

			if ('message' in addresses) {
				throw new Error(addresses.message);
			}

			return status ? addresses.filter((address) => address.status === status) : addresses;
		},
	});

	return {
		userAddress,
		isUserAddressLoading,
		isUserAddressError,
	};
}
