import { useQuery, useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

import { client } from '@workspace/server/client-rpc';

import { ChatMessageType } from '../types';
import { useAuth } from '#providers/auth-providers';
import { privateQueryKeys, privateQueryRoot } from '@workspace/shared/utils/private-query-keys';

export const useChatMessageHook = (chatMessageProps: ChatMessageType) => {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	const {
		data: orderProposal,
		isLoading: isOrderProposalLoading,
		error: orderProposalError,
	} = useQuery({
		queryKey: privateQueryKeys.orderProposal(user?.profile_id, chatMessageProps.order_proposal_id ?? undefined),
		enabled: user !== null && !!chatMessageProps.order_proposal_id,
		queryFn: async () => {
			if (!chatMessageProps.order_proposal_id) return null;

			const response = await client.orders_proposals.auth[':id'].$get({
				param: { id: chatMessageProps.order_proposal_id.toString() },
			});

			if (!response.ok) throw new Error('Failed to fetch order proposal');

			return response.json();
		},
	});

	const updateProposal = useMutation({
		mutationFn: async (params: { orderProposalId: number; item_id: number; status: 'accepted' | 'rejected' }) => {
			const response = await client.orders_proposals.auth.$put({
				json: {
					id: params.orderProposalId,
					status: params.status,
					item_id: params.item_id,
				},
			});

			if (!response.ok) throw new Error('Failed to update order proposal');

			return response.json();
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: [...privateQueryRoot(user?.profile_id), 'chat-messages'] });
			queryClient.invalidateQueries({
				queryKey: privateQueryKeys.orderProposal(user?.profile_id, variables.orderProposalId),
			});
		},
	});

	return {
		orderProposal,
		isOrderProposalLoading,
		orderProposalError,
		updateProposal,
	};
};
