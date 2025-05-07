import { StateCreator } from "zustand";

export type ChatStore = {
  chatId?: number;
  setChatId: (chatId: number) => void;
};

export const createChatSlice: StateCreator<ChatStore> = (set) => ({
  chatId: undefined,
  setChatId: (chatId: number) => set({ chatId }),
});
