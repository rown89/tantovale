import { client } from '@workspace/server/client-rpc';

export class AddressLookupError extends Error {
	constructor(readonly status: number) {
		super(`Active address lookup failed with status ${status}`);
		this.name = 'AddressLookupError';
	}
}

export default async function AddressProtectedRoute() {
	const hasAddressResponse = await client.profile.auth.profile_active_address_id.$get();

	if (!hasAddressResponse.ok) throw new AddressLookupError(hasAddressResponse.status);

	const address_id = await hasAddressResponse.json();

	return address_id;
}
