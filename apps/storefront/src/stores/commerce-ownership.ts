export type CommerceOwnershipState = {
	commerceOwnerProfileId: number | null;
	commerceOwnerItemId: number | null;
};

export function commerceOwnerMatches(
	state: Partial<CommerceOwnershipState>,
	profileId: number | null | undefined,
	itemId: number | null | undefined,
): boolean {
	return state.commerceOwnerProfileId === profileId && state.commerceOwnerItemId === itemId;
}
