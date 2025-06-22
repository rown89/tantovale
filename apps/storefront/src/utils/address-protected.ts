import { client } from '@workspace/server/client-rpc';

export default async function AddressProtectedRoute() {
	const hasAddressResponse = await client.profile.auth.profile_active_address_id.$get();

	if (!hasAddressResponse.ok) return false;

	const address_id = await hasAddressResponse.json();

	return address_id;
}
