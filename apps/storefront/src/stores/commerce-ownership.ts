export type CommerceOwnershipState = {
	commerceOwnerProfileId: number | null;
	commerceOwnerItemId: number | null;
	commerceOwnerEpoch: number;
};

export type CommerceOwnerSnapshot = CommerceOwnershipState;

export type CommerceRequestSnapshot = CommerceOwnerSnapshot & {
	requestToken: number;
};

export function captureCommerceOwner(state: CommerceOwnershipState): CommerceOwnerSnapshot {
	return {
		commerceOwnerProfileId: state.commerceOwnerProfileId,
		commerceOwnerItemId: state.commerceOwnerItemId,
		commerceOwnerEpoch: state.commerceOwnerEpoch,
	};
}

export function commerceOwnerMatches(state: Partial<CommerceOwnershipState>, snapshot: CommerceOwnerSnapshot): boolean {
	return (
		state.commerceOwnerProfileId === snapshot.commerceOwnerProfileId &&
		state.commerceOwnerItemId === snapshot.commerceOwnerItemId &&
		state.commerceOwnerEpoch === snapshot.commerceOwnerEpoch
	);
}

export function captureCommerceRequest(state: CommerceOwnershipState, requestToken: number): CommerceRequestSnapshot {
	return { ...captureCommerceOwner(state), requestToken };
}

export function commerceRequestMatches(
	state: Partial<CommerceOwnershipState>,
	snapshot: CommerceRequestSnapshot,
	activeRequestToken: number,
): boolean {
	return commerceOwnerMatches(state, snapshot) && activeRequestToken === snapshot.requestToken;
}
