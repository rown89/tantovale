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
  chat_room_id: number;
};

interface handleProposalProps {
  item_id: number;
  proposal_price: number;
  message?: string;
}

export type OrderProposalStore = {
  proposal_price: number;
  proposal_created_at: string | null;
  proposal_status: SelectOrderProposal["status"] | undefined;
  isProposalModalOpen: boolean;
  setIsProposalModalOpen: (isProposalModalOpen: boolean) => void;
  setProposalPrice: (proposal_price: number) => void;
  handleProposal: ({
    item_id,
    proposal_price,
    message,
  }: handleProposalProps) => Promise<OrderProposalProps | undefined>;
  resetProposal: () => void;
};

export const createProposalSlice: StateCreator<OrderProposalStore> = (set) => ({
  proposal_price: 0,
  proposal_created_at: null,
  proposal_status: undefined,
  isProposalModalOpen: false,
  setProposalPrice: (proposal_price: number) => set({ proposal_price }),
  setIsProposalModalOpen: (isProposalModalOpen: boolean) =>
    set({ isProposalModalOpen }),
  handleProposal: async ({
    item_id,
    proposal_price,
    message,
  }: handleProposalProps) => {
    try {
      const response = await client.orders_proposals.auth.create.$post({
        json: {
          item_id,
          proposal_price,
          message,
        },
      });

      if (!response.ok) return undefined;

      const data = await response.json();

      set({
        proposal_price: data.proposal.proposal_price,
        proposal_created_at: data.proposal.created_at,
        proposal_status: data.proposal.status,
      });

      // Transform the response to match OrderProposalProps
      const orderProposalProps: OrderProposalProps = {
        id: data.proposal.id,
        item_id: data.proposal.item_id,
        status: data.proposal.status,
        proposal_price: data.proposal.proposal_price,
        user_id: data.proposal.user_id,
        created_at: data.proposal.created_at,
        updated_at: data.proposal.updated_at,
        chat_room_id: data.chatRoomId,
      };

      return orderProposalProps;
    } catch (error) {
      console.error("Failed to create proposal:", error);
      return undefined;
    }
  },
  resetProposal: () =>
    set({
      proposal_price: 0,
      proposal_created_at: null,
      proposal_status: undefined,
      isProposalModalOpen: false,
    }),
});
