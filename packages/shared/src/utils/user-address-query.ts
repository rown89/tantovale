import { privateQueryRoot } from './private-query-keys';

export type UserAddressStatus = 'active' | 'inactive' | 'deleted';

export function userAddressQueryRoot(profileId: number | undefined) {
	return [...privateQueryRoot(profileId), 'userAddress'] as const;
}

export function userAddressQueryKey(profileId: number | undefined, status?: UserAddressStatus) {
	return [...userAddressQueryRoot(profileId), status] as const;
}
