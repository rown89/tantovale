import { privateQueryRoot } from '@workspace/shared/utils/private-query-keys';

type CommerceFlow = 'buy_now' | 'proposal';

export function shippingQuoteQueryRoot(profileId: number | undefined) {
	return [...privateQueryRoot(profileId), 'shipping_quote'] as const;
}

export function shippingQuoteQueryKey(input: {
	flow: CommerceFlow;
	profileId: number | undefined;
	addressId: number | undefined;
	itemId: number | undefined;
}) {
	return [...shippingQuoteQueryRoot(input.profileId), input.addressId, input.flow, input.itemId] as const;
}

export function platformCostsQueryRoot(profileId: number | undefined) {
	return [...privateQueryRoot(profileId), 'platforms_costs'] as const;
}

export function platformCostsQueryKey(input: {
	flow: CommerceFlow;
	profileId: number | undefined;
	addressId: number | undefined;
	itemId: number | undefined;
	price: number | undefined;
	shippingQuoteId: string | undefined;
	shippingAmount: number | undefined;
}) {
	return [
		...platformCostsQueryRoot(input.profileId),
		input.addressId,
		input.flow,
		input.itemId,
		input.price,
		input.shippingQuoteId,
		input.shippingAmount,
	] as const;
}

export function addressDependentQueryRoots(profileId: number) {
	return [
		[...privateQueryRoot(profileId), 'userAddress'] as const,
		shippingQuoteQueryRoot(profileId),
		platformCostsQueryRoot(profileId),
	] as const;
}

export function isCommerceActionReady(input: {
	hasMandatoryArguments: boolean;
	canQuoteShipping: boolean;
	activeAddressId: number | undefined;
	hasShippingQuote: boolean;
	hasPlatformCosts: boolean;
	isShippingLoading: boolean;
	isPlatformLoading: boolean;
	isAddressFetching: boolean;
	isShippingFetching: boolean;
	isPlatformFetching: boolean;
	hasShippingError: boolean;
	hasPlatformError: boolean;
	isMutating: boolean;
}): boolean {
	return (
		input.hasMandatoryArguments &&
		input.canQuoteShipping &&
		input.activeAddressId !== undefined &&
		input.hasShippingQuote &&
		input.hasPlatformCosts &&
		!input.isShippingLoading &&
		!input.isPlatformLoading &&
		!input.isAddressFetching &&
		!input.isShippingFetching &&
		!input.isPlatformFetching &&
		!input.hasShippingError &&
		!input.hasPlatformError &&
		!input.isMutating
	);
}
