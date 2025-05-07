import { StateCreator } from "zustand";
import { client } from "@workspace/server/client-rpc";
import { SelectOrderProposal } from "@workspace/server/database";

type OrderProposalProps = Omit<
  SelectOrderProposal,
  "created_at" | "updated_at"
> & {
  created_at: string;
  updated_at: string;
} & {
  chatRoomId: number;
};

export type OrderProposalStore = {
  originalItemPrice: number;
  proposalPrice: number;
  proposal_created_at: string | null;
  proposal_status: SelectOrderProposal["status"] | undefined;
  isProposalModalOpen: boolean;
  setIsProposalModalOpen: (isProposalModalOpen: boolean) => void;
  setOriginalItemPrice: (originalItemPrice: number) => void;
  setProposalPrice: (proposalPrice: number) => void;
  handleProposal: (
    item_id: number,
    price: number,
    message?: string,
  ) => Promise<OrderProposalProps | undefined>;
  resetProposal: () => void;
};

export const createProposalSlice: StateCreator<OrderProposalStore> = (set) => ({
  originalItemPrice: 0,
  proposalPrice: 0,
  proposal_created_at: null,
  proposal_status: undefined,
  isProposalModalOpen: false,
  setOriginalItemPrice: (originalItemPrice: number) =>
    set({ originalItemPrice }),
  setProposalPrice: (proposalPrice: number) => set({ proposalPrice }),
  setIsProposalModalOpen: (isProposalModalOpen: boolean) =>
    set({ isProposalModalOpen }),
  handleProposal: async (item_id: number, price: number, message?: string) => {
    try {
      const response = await client.orders_proposals.auth.create.$post({
        json: {
          item_id,
          price,
          message,
        },
      });

      if (!response.ok) return undefined;

      const data = await response.json();

      set({
        originalItemPrice: price,
        proposalPrice: data.proposal.price,
        proposal_created_at: data.proposal.created_at,
        proposal_status: data.proposal.status,
      });

      // Transform the response to match OrderProposalProps
      const orderProposalProps: OrderProposalProps = {
        id: data.proposal.id,
        item_id: data.proposal.item_id,
        status: data.proposal.status,
        price: data.proposal.price,
        user_id: data.proposal.user_id,
        created_at: data.proposal.created_at,
        updated_at: data.proposal.updated_at,
        chatRoomId: data.chatRoomId,
      };

      return orderProposalProps;
    } catch (error) {
      console.error("Failed to create proposal:", error);
      return undefined;
    }
  },
  resetProposal: () =>
    set({
      originalItemPrice: 0,
      proposalPrice: 0,
      proposal_created_at: null,
      proposal_status: undefined,
    }),
});
