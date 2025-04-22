import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';
import { useState } from 'react';

export function useProfileData() {
	const [isPaymentProviderConnected, setIsPaymentProviderConnected] = useState(false);

	const {
		data: profile,
		isLoading: isLoadingProfile,
		isError: isErrorProfile,
	} = useQuery({
		queryKey: ['profile-data'],
		queryFn: async () => {
			const res = await client.profile.auth.$get();

			if (!res.ok) return undefined;

			return await res.json();
		},
	});

	return {
		profile,
		isLoadingProfile,
		isErrorProfile,
		isPaymentProviderConnected,
	};
}
