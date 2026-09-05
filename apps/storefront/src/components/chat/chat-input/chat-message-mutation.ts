import { privateQueryKeys } from '@workspace/shared/utils/private-query-keys';

type ChatQueryClient = {
	invalidateQueries(input: { queryKey: readonly unknown[] }): Promise<unknown>;
};

export function createChatMessageMutationOptions(input: {
	profileId: number | undefined;
	roomId: number;
	post(message: string): Promise<Response>;
	queryClient: ChatQueryClient;
	reset(): void;
}) {
	return {
		mutationFn: async (message: string) => {
			const response = await input.post(message);
			if (!response.ok) throw new Error('Failed to send message');
		},
		onSuccess: async () => {
			input.reset();
			await input.queryClient.invalidateQueries({
				queryKey: privateQueryKeys.chatMessages(input.profileId, input.roomId),
			});
		},
	};
}
