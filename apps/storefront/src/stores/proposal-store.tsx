import { create } from "zustand";
import { client } from "@workspace/server/client-rpc";
import { SelectOrderProposal } from "@workspace/server/database";

type OrderProposalProps = Omit<
  SelectOrderProposal,
  "created_at" | "updated_at"
> & {
  created_at: string;
  updated_at: string;
};

type OrderProposalStore = {
  originalItemPrice: number;
  proposalPrice: number;
  isProposalModalOpen: boolean;
  setIsProposalModalOpen: (isProposalModalOpen: boolean) => void;
  setOriginalItemPrice: (originalItemPrice: number) => void;
  setProposalPrice: (proposalPrice: number) => void;
  handleProposal: (
    item_id: number,
    price: number,
  ) => Promise<OrderProposalProps | false>;
  resetProposal: () => void;
};

const useProposalStore = create<OrderProposalStore>((set) => ({
  originalItemPrice: 0,
  proposalPrice: 0,
  isProposalModalOpen: false,
  setOriginalItemPrice: (originalItemPrice: number) =>
    set({ originalItemPrice }),
  setProposalPrice: (proposalPrice: number) => set({ proposalPrice }),
  setIsProposalModalOpen: (
    isProposalModalOpen: OrderProposalStore["isProposalModalOpen"],
  ) => set({ isProposalModalOpen }),
  handleProposal: async (item_id: number, price: number) => {
    try {
      const response = await client.orders_proposals.auth.create.$post({
        json: {
          item_id,
          price,
        },
      });

      if (!response.ok) return false;

      const proposal = await response.json();

      set({ originalItemPrice: price, proposalPrice: proposal.price });

      return proposal;
    } catch (error) {
      console.error("Failed to create proposal:", error);
      return false;
    }
  },
  resetProposal: () => set({ originalItemPrice: 0, proposalPrice: 0 }),
}));

export default useProposalStore;
