import { StateCreator } from "zustand";

export type ChatStore = {
  selectedChat: number;
  selectedOrderProposal: number;
  setSelectedChat: (chatId: number) => void;
  setSelectedOrderProposal: (orderProposalId: number) => void;
};

export const createChatSlice: StateCreator<ChatStore> = (set) => ({
  selectedChat: 0,
  selectedOrderProposal: 0,
  setSelectedChat: (chatId: number) => set({ selectedChat: chatId }),
  setSelectedOrderProposal: (orderProposalId: number) =>
    set({ selectedOrderProposal: orderProposalId }),
});
