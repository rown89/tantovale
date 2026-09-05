export function visibleServerProposal<T extends { id?: number | null }>(
	proposal: T | undefined,
	dismissedProposalId?: number,
): T | undefined {
	return proposal !== undefined && proposal.id !== undefined && proposal.id === dismissedProposalId
		? undefined
		: proposal;
}
