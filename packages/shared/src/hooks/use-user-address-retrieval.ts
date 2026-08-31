import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';
import { type UserAddressStatus, userAddressQueryKey } from '../utils/user-address-query';

export function useAddressesRetrieval({
	profileId,
	status,
	enabled = true,
}: { profileId?: number; status?: UserAddressStatus; enabled?: boolean } = {}) {
	const {
		data: userAddress,
		isLoading: isUserAddressLoading,
		isError: isUserAddressError,
	} = useQuery({
		queryKey: userAddressQueryKey(profileId, status),
		enabled: enabled && profileId !== undefined,
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
