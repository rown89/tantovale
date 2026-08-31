export type UserAddressStatus = 'active' | 'inactive' | 'deleted';

export function userAddressQueryRoot(profileId: number | undefined) {
	return ['userAddress', profileId] as const;
}

export function userAddressQueryKey(profileId: number | undefined, status?: UserAddressStatus) {
	return [...userAddressQueryRoot(profileId), status] as const;
}
