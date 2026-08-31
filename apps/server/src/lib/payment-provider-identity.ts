import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import type { DrizzleClient } from '#database/index';
import { addressStatus, PAYMENT_PROVIDER_IDENTITY_STATES } from '#database/schemas/enumerated_values';
import { addresses, profiles } from '#db-schema';
import type { User } from '#lib/types';
import { PaymentProviderService } from '../routes/payments/payment-provider.service';
import { environment } from '#utils/constants';

import { acquirePaymentProviderIdentityLock } from './payment-provider-identity-lock';

export async function ensurePaymentProviderIdentity(
	db: DrizzleClient['db'],
	user: Pick<User, 'profile_id' | 'email'>,
	requestIp: string,
): Promise<void> {
	const waitDeadline = Date.now() + environment.PROVIDER_REQUEST_TIMEOUT_MS * 2;
	let waitedForAnotherAttempt = false;
	let preparation:
		| { done: true }
		| { wait: true }
		| {
				done: false;
				attemptId: string;
				countryCode: string;
				firstName: string;
				lastName: string;
		  };

	for (;;) {
		preparation = await db.transaction(async (identityTx) => {
			await acquirePaymentProviderIdentityLock(identityTx, user.profile_id);
			const [profile] = await identityTx
				.select({
					name: profiles.name,
					surname: profiles.surname,
					payment_provider_id: profiles.payment_provider_id,
					attemptId: profiles.payment_provider_identity_attempt_id,
					identityState: profiles.payment_provider_identity_state,
				})
				.from(profiles)
				.where(eq(profiles.id, user.profile_id))
				.limit(1);
			if (!profile) throw new Error('Profile not found');
			if (profile.payment_provider_id) return { done: true as const };
			if (profile.identityState === PAYMENT_PROVIDER_IDENTITY_STATES.CREATING) {
				return { wait: true as const };
			}
			if (
				waitedForAnotherAttempt &&
				profile.identityState === PAYMENT_PROVIDER_IDENTITY_STATES.RECONCILIATION_REQUIRED
			) {
				throw new Error('Payment provider identity requires reconciliation');
			}
			const [address] = await identityTx
				.select({ country_code: addresses.country_code })
				.from(addresses)
				.where(and(eq(addresses.profile_id, user.profile_id), eq(addresses.status, addressStatus.ACTIVE)))
				.limit(1);
			if (!address) throw new Error('Active address not found');
			const attemptId = profile.attemptId ?? randomUUID();
			const [claimed] = await identityTx
				.update(profiles)
				.set({
					payment_provider_identity_attempt_id: attemptId,
					payment_provider_identity_state: PAYMENT_PROVIDER_IDENTITY_STATES.CREATING,
					updated_at: new Date(),
				})
				.where(
					and(eq(profiles.id, user.profile_id), eq(profiles.payment_provider_identity_state, profile.identityState)),
				)
				.returning({ id: profiles.id });
			if (!claimed) return { wait: true as const };
			return {
				done: false as const,
				attemptId,
				countryCode: address.country_code,
				firstName: profile.name,
				lastName: profile.surname,
			};
		});
		if ('done' in preparation) break;
		waitedForAnotherAttempt = true;
		if (Date.now() >= waitDeadline) {
			await db.transaction(async (identityTx) => {
				await acquirePaymentProviderIdentityLock(identityTx, user.profile_id);
				await identityTx
					.update(profiles)
					.set({
						payment_provider_identity_state: PAYMENT_PROVIDER_IDENTITY_STATES.RECONCILIATION_REQUIRED,
						updated_at: new Date(),
					})
					.where(
						and(
							eq(profiles.id, user.profile_id),
							eq(profiles.payment_provider_identity_state, PAYMENT_PROVIDER_IDENTITY_STATES.CREATING),
						),
					);
			});
			throw new Error('Payment provider identity creation timed out and requires reconciliation');
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	if (preparation.done) return;
	const markReconciliationRequired = async () => {
		await db.transaction(async (identityTx) => {
			await acquirePaymentProviderIdentityLock(identityTx, user.profile_id);
			await identityTx
				.update(profiles)
				.set({
					payment_provider_identity_state: PAYMENT_PROVIDER_IDENTITY_STATES.RECONCILIATION_REQUIRED,
					updated_at: new Date(),
				})
				.where(
					and(
						eq(profiles.id, user.profile_id),
						eq(profiles.payment_provider_identity_attempt_id, preparation.attemptId),
						eq(profiles.payment_provider_identity_state, PAYMENT_PROVIDER_IDENTITY_STATES.CREATING),
					),
				);
		});
	};

	let guest: Awaited<ReturnType<PaymentProviderService['createGuestUser']>>;
	try {
		guest = await new PaymentProviderService().createGuestUser({
			id: user.profile_id,
			email: user.email,
			first_name: preparation.firstName,
			last_name: preparation.lastName,
			country_code: preparation.countryCode,
			tos_acceptance: { unix_timestamp: Math.floor(Date.now() / 1_000), ip: requestIp },
		});
	} catch (error) {
		await markReconciliationRequired();
		throw error;
	}

	try {
		await db.transaction(async (identityTx) => {
			await acquirePaymentProviderIdentityLock(identityTx, user.profile_id);
			const [updated] = await identityTx
				.update(profiles)
				.set({
					payment_provider_id: guest.id,
					payment_provider_identity_state: PAYMENT_PROVIDER_IDENTITY_STATES.CREATED,
					updated_at: new Date(),
				})
				.where(
					and(
						eq(profiles.id, user.profile_id),
						eq(profiles.payment_provider_identity_attempt_id, preparation.attemptId),
						eq(profiles.payment_provider_identity_state, PAYMENT_PROVIDER_IDENTITY_STATES.CREATING),
					),
				)
				.returning({ id: profiles.id });
			if (!updated) throw new Error('Failed to persist payment provider guest user');
		});
	} catch (error) {
		await markReconciliationRequired();
		throw error;
	}
}
