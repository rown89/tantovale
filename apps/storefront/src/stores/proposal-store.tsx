import { StateCreator } from 'zustand';
import { client } from '@workspace/server/client-rpc';
import { SelectOrderProposal } from '@workspace/server/database';
import {
	captureCommerceOwner,
	captureCommerceRequest,
	commerceRequestMatches,
	CommerceOwnershipState,
} from './commerce-ownership';

type OrderProposalProps = Omit<
	SelectOrderProposal,
	| 'created_at'
	| 'updated_at'
	| 'payment_provider_charge'
	| 'platform_charge'
	| 'shipping_price'
	| 'shipping_quote_id'
	| 'original_price'
> & {
	created_at: string;
	updated_at: string;
} & {
	chat_room_id: number;
};

interface handleProposalProps {
	item_id: number;
	proposal_price: number;
	shipping_label_id: string;
	shipping_quote_id?: string;
	message: string;
}

export type OrderProposalStore = {
	clientProposalId?: number;
	clientProposalCreatedAt?: string;
	dismissedServerProposalId?: number;
	isProposalModalOpen: boolean;
	isCreatingProposal: boolean;
	proposalRequestToken: number;
	setIsProposalModalOpen: (isProposalModalOpen: boolean) => void;
	setIsCreatingProposal: (isCreatingProposal: boolean) => void;
	handleBuyerAbortedProposal: (proposal_id: number) => Promise<ProposalAbortResult>;
	handleProposal: ({
		item_id,
		proposal_price,
		shipping_label_id,
		message,
	}: handleProposalProps) => Promise<OrderProposalProps | undefined>;
	resetProposal: () => void;
};

export type ProposalAbortResult = 'cancelled' | 'failed' | 'stale';

export const createProposalSlice: StateCreator<
	OrderProposalStore & CommerceOwnershipState,
	[],
	[],
	OrderProposalStore
> = (set, get) => ({
	clientProposalId: undefined,
	clientProposalCreatedAt: undefined,
	dismissedServerProposalId: undefined,
	isProposalModalOpen: false,
	isCreatingProposal: false,
	proposalRequestToken: 0,
	setIsProposalModalOpen: (isProposalModalOpen: boolean) => set({ isProposalModalOpen }),
	setIsCreatingProposal: (isCreatingProposal: boolean) => set({ isCreatingProposal }),
	handleBuyerAbortedProposal: async (proposal_id: number) => {
		if (get().isCreatingProposal) return 'stale';
		const requestOwner = captureCommerceOwner(get());
		const requestToken = get().proposalRequestToken + 1;
		const requestSnapshot = captureCommerceRequest(requestOwner, requestToken);
		set({
			isCreatingProposal: true,
			proposalRequestToken: requestToken,
		});

		try {
			const response = await client.orders_proposals.auth.buyer_aborted_proposal.$post({
				json: {
					proposal_id,
				},
			});
			if (!commerceRequestMatches(get(), requestSnapshot, get().proposalRequestToken)) return 'stale';
			if (!response.ok) return 'failed';

			set({
				clientProposalId: undefined,
				clientProposalCreatedAt: undefined,
				dismissedServerProposalId: proposal_id,
			});

			return 'cancelled';
		} catch (error) {
			if (!commerceRequestMatches(get(), requestSnapshot, get().proposalRequestToken)) return 'stale';
			console.error('Failed to abort proposal:', error);
			return 'failed';
		} finally {
			if (commerceRequestMatches(get(), requestSnapshot, get().proposalRequestToken)) {
				set({ isCreatingProposal: false });
			}
		}
	},
	handleProposal: async ({
		item_id,
		proposal_price,
		shipping_label_id,
		shipping_quote_id,
		message,
	}: handleProposalProps) => {
		if (get().isCreatingProposal) return undefined;
		const requestOwner = captureCommerceOwner(get());
		if (requestOwner.commerceOwnerItemId !== item_id) return undefined;
		const requestToken = get().proposalRequestToken + 1;
		const requestSnapshot = captureCommerceRequest(requestOwner, requestToken);
		set({
			isCreatingProposal: true,
			proposalRequestToken: requestToken,
			dismissedServerProposalId: undefined,
		});

		try {
			const response = await client.orders_proposals.auth.create.$post({
				json: {
					item_id,
					proposal_price,
					shipping_label_id,
					shipping_quote_id,
					message,
				},
			});

			if (!response.ok) return undefined;

			const data = await response.json();
			if (!commerceRequestMatches(get(), requestSnapshot, get().proposalRequestToken)) {
				return undefined;
			}

			set({
				clientProposalId: data.proposal.id,
				clientProposalCreatedAt: data.proposal.created_at,
			});

			// Transform the response to match OrderProposalProps
			const orderProposalProps: OrderProposalProps = {
				id: data.proposal.id,
				item_id: data.proposal.item_id,
				status: data.proposal.status,
				proposal_price: data.proposal.proposal_price,
				profile_id: data.proposal.profile_id,
				created_at: data.proposal.created_at,
				updated_at: data.proposal.updated_at,
				chat_room_id: data.chatRoomId,
				shipping_label_id: data.proposal.shipping_label_id,
			};

			return orderProposalProps;
		} catch (error) {
			console.error('Failed to create proposal:', error);
			return undefined;
		} finally {
			if (commerceRequestMatches(get(), requestSnapshot, get().proposalRequestToken)) {
				set({ isCreatingProposal: false });
			}
		}
	},
	resetProposal: () =>
		set({
			clientProposalId: undefined,
			clientProposalCreatedAt: undefined,
			dismissedServerProposalId: undefined,
			isProposalModalOpen: false,
			isCreatingProposal: false,
			proposalRequestToken: get().proposalRequestToken + 1,
		}),
});
