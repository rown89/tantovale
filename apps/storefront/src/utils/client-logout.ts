import { shouldRemovePrivateQuery } from '@workspace/shared/utils/private-query-keys';

type PrivateQueryClient = {
	removeQueries(options: { predicate(query: { queryKey: readonly unknown[] }): boolean }): void;
};

export function logoutClientSession(input: {
	queryClient: PrivateQueryClient;
	resetPrivateCommerceState(): void;
	clearIdentity(): void;
	navigateToLogout(): void;
}): void {
	input.queryClient.removeQueries({ predicate: ({ queryKey }) => shouldRemovePrivateQuery(queryKey) });
	input.resetPrivateCommerceState();
	input.clearIdentity();
	input.navigateToLogout();
}

export function commitClientIdentity<T extends { profile_id: number } | null>(input: {
	currentIdentity: T;
	nextIdentity: T;
	resetPrivateCommerceState(): void;
	commit(identity: T): void;
}): void {
	if (input.currentIdentity?.profile_id !== input.nextIdentity?.profile_id) {
		input.resetPrivateCommerceState();
	}
	input.commit(input.nextIdentity);
}
