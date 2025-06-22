import { ChatMessage } from './types';
import { useQuery, useMutation } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';
import { useQueryClient } from '@tanstack/react-query';

export const useChatMessageHook = (message: ChatMessage) => {
	const queryClient = useQueryClient();

	const {
		data: orderProposal,
		isLoading: isOrderProposalLoading,
		error: orderProposalError,
	} = useQuery({
		queryKey: ['orderProposal', message.order_proposal_id],
		queryFn: async () => {
			if (!message.order_proposal_id) return null;

			const response = await client.orders_proposals.auth[':id'].$get({
				param: { id: message.order_proposal_id.toString() },
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
			queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
			queryClient.invalidateQueries({
				queryKey: ['orderProposal', variables.orderProposalId],
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
