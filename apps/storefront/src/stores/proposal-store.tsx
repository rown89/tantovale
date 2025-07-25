import { StateCreator } from 'zustand';
import { client } from '@workspace/server/client-rpc';
import { SelectOrderProposal } from '@workspace/server/database';

type OrderProposalProps = Omit<
	SelectOrderProposal,
	'created_at' | 'updated_at' | 'payment_provider_charge' | 'platform_charge' | 'shipping_price' | 'original_price'
> & {
	created_at: string;
	updated_at: string;
} & {
	chat_room_id: number;
};

interface handleProposalProps {
	item_id: number;
	proposal_price: number;
	sp_shipment_id: string;
	message: string;
}

export type OrderProposalStore = {
	clientProposalId?: number;
	clientProposalCreatedAt?: string;
	isProposalModalOpen: boolean;
	isCreatingProposal: boolean;
	setIsProposalModalOpen: (isProposalModalOpen: boolean) => void;
	setIsCreatingProposal: (isCreatingProposal: boolean) => void;
	handleBuyerAbortedProposal: (proposal_id: number) => Promise<boolean>;
	handleProposal: ({
		item_id,
		proposal_price,
		sp_shipment_id,
		message,
	}: handleProposalProps) => Promise<OrderProposalProps | undefined>;
	resetProposal: () => void;
};

export const createProposalSlice: StateCreator<OrderProposalStore> = (set) => ({
	clientProposalId: undefined,
	clientProposalCreatedAt: undefined,
	isProposalModalOpen: false,
	isCreatingProposal: false,
	setIsProposalModalOpen: (isProposalModalOpen: boolean) => set({ isProposalModalOpen }),
	setIsCreatingProposal: (isCreatingProposal: boolean) => set({ isCreatingProposal }),
	handleBuyerAbortedProposal: async (proposal_id: number) => {
		set({
			isCreatingProposal: true,
		});

		try {
			await client.orders_proposals.auth.buyer_aborted_proposal.$post({
				json: {
					proposal_id,
				},
			});

			set({
				clientProposalId: undefined,
				clientProposalCreatedAt: undefined,
			});

			return true;
		} catch (error) {
			console.error('Failed to abort proposal:', error);
			return false;
		} finally {
			set({
				isCreatingProposal: false,
			});
		}
	},
	handleProposal: async ({ item_id, proposal_price, sp_shipment_id, message }: handleProposalProps) => {
		set({
			isCreatingProposal: true,
		});

		try {
			const response = await client.orders_proposals.auth.create.$post({
				json: {
					item_id,
					proposal_price,
					sp_shipment_id,
					message,
				},
			});

			if (!response.ok) return undefined;

			const data = await response.json();

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
				sp_shipment_id: data.proposal.sp_shipment_id,
			};

			return orderProposalProps;
		} catch (error) {
			console.error('Failed to create proposal:', error);
			return undefined;
		} finally {
			set({
				isCreatingProposal: false,
			});
		}
	},
	resetProposal: () =>
		set({
			clientProposalId: undefined,
			clientProposalCreatedAt: undefined,
			isProposalModalOpen: false,
		}),
});
