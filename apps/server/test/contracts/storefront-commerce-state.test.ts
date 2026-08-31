import { describe, expect, it } from 'vitest';

const commerceModulePath = '../../../storefront/src/utils/commerce-query-state';
const addressModulePath = '../../../../packages/shared/src/utils/user-address-query';

async function loadCommerceHelpers() {
	return import(/* @vite-ignore */ commerceModulePath) as Promise<{
		addressDependentQueryRoots(profileId: number): readonly (readonly unknown[])[];
		isCommerceActionReady(input: Record<string, boolean | number | undefined>): boolean;
		platformCostsQueryKey(input: Record<string, string | number | undefined>): readonly unknown[];
		shippingQuoteQueryKey(input: Record<string, string | number | undefined>): readonly unknown[];
	}>;
}

async function loadAddressHelpers() {
	return import(/* @vite-ignore */ addressModulePath) as Promise<{
		userAddressQueryKey(profileId: number | undefined, status?: string): readonly unknown[];
	}>;
}

describe('storefront commerce query identity and action gating', () => {
	it('scopes address and commerce queries to the authenticated profile and active address', async () => {
		const { addressDependentQueryRoots, platformCostsQueryKey, shippingQuoteQueryKey } = await loadCommerceHelpers();
		const { userAddressQueryKey } = await loadAddressHelpers();
		expect(userAddressQueryKey(17, 'active')).toEqual(['userAddress', 17, 'active']);
		expect(shippingQuoteQueryKey({ flow: 'buy_now', profileId: 17, addressId: 29, itemId: 41 })).toEqual([
			'shipping_quote',
			17,
			29,
			'buy_now',
			41,
		]);
		expect(
			platformCostsQueryKey({
				flow: 'proposal',
				profileId: 17,
				addressId: 29,
				itemId: 41,
				price: 10_000,
				shippingQuoteId: 'quote-1',
				shippingAmount: 7.5,
			}),
		).toEqual(['platforms_costs', 17, 29, 'proposal', 41, 10000, 'quote-1', 7.5]);
		expect(addressDependentQueryRoots(17)).toEqual([
			['userAddress', 17],
			['shipping_quote', 17],
			['platforms_costs', 17],
		]);
	});

	it('enables commerce submission only when every address, quote, cost, and request prerequisite is ready', async () => {
		const { isCommerceActionReady } = await loadCommerceHelpers();
		const ready = {
			hasMandatoryArguments: true,
			canQuoteShipping: true,
			activeAddressId: 29,
			hasShippingQuote: true,
			hasPlatformCosts: true,
			isShippingLoading: false,
			isPlatformLoading: false,
			hasShippingError: false,
			hasPlatformError: false,
			isMutating: false,
		};

		expect(isCommerceActionReady(ready)).toBe(true);
		for (const key of Object.keys(ready) as Array<keyof typeof ready>) {
			if (key === 'activeAddressId') {
				expect(isCommerceActionReady({ ...ready, activeAddressId: undefined })).toBe(false);
			} else {
				expect(isCommerceActionReady({ ...ready, [key]: !ready[key] })).toBe(false);
			}
		}
	});
});
