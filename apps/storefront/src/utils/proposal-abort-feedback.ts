import type { ProposalAbortResult } from '#stores/proposal-store';

export function applyProposalAbortFeedback(
	result: ProposalAbortResult,
	actions: { onCancelled(): void; onFailed(): void },
): void {
	if (result === 'cancelled') actions.onCancelled();
	if (result === 'failed') actions.onFailed();
}
