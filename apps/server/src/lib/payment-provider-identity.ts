import { and, eq, isNull } from 'drizzle-orm';

import type { DrizzleClient } from '#database/index';
import { addressStatus } from '#database/schemas/enumerated_values';
import { addresses, profiles } from '#db-schema';
import type { User } from '#lib/types';
import { PaymentProviderService } from '../routes/payments/payment-provider.service';

import { acquirePaymentProviderIdentityLock } from './payment-provider-identity-lock';

export async function ensurePaymentProviderIdentity(
	db: DrizzleClient['db'],
	user: Pick<User, 'profile_id' | 'email'>,
	requestIp: string,
): Promise<void> {
	await db.transaction(async (identityTx) => {
		await acquirePaymentProviderIdentityLock(identityTx, user.profile_id);
		const [profile] = await identityTx
			.select({
				name: profiles.name,
				surname: profiles.surname,
				payment_provider_id: profiles.payment_provider_id,
			})
			.from(profiles)
			.where(eq(profiles.id, user.profile_id))
			.limit(1);
		if (!profile) throw new Error('Profile not found');
		if (profile.payment_provider_id) return;
		const [address] = await identityTx
			.select({ country_code: addresses.country_code })
			.from(addresses)
			.where(and(eq(addresses.profile_id, user.profile_id), eq(addresses.status, addressStatus.ACTIVE)))
			.limit(1);
		if (!address) throw new Error('Active address not found');
		const guest = await new PaymentProviderService().createGuestUser({
			id: user.profile_id,
			email: user.email,
			first_name: profile.name,
			last_name: profile.surname,
			country_code: address.country_code,
			tos_acceptance: { unix_timestamp: Math.floor(Date.now() / 1_000), ip: requestIp },
		});
		const [updated] = await identityTx
			.update(profiles)
			.set({ payment_provider_id: guest.id })
			.where(and(eq(profiles.id, user.profile_id), isNull(profiles.payment_provider_id)))
			.returning({ id: profiles.id });
		if (!updated) throw new Error('Failed to persist payment provider guest user');
	});
}
