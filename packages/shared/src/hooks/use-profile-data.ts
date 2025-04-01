import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/shared/clients/rpc-client';

export function useProfileData() {
	const {
		data: profile,
		isLoading: isLoadingProfile,
		isError: isErrorProfile,
	} = useQuery({
		queryKey: ['profile-data'],
		queryFn: async () => {
			const res = await client.auth.profile.$get();

			if (!res.ok) return undefined;

			return await res.json();
		},
	});

	return {
		profile,
		isLoadingProfile,
		isErrorProfile,
	};
}
