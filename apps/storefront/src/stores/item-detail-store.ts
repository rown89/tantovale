import { ItemWrapperProps } from "#app/item/[slug]/item-detail-wrapper/types";
import { StateCreator } from "zustand";

export type ItemDetailStore = {
  item?: ItemWrapperProps["item"];
  itemOwnerData?: ItemWrapperProps["itemOwnerData"];
  chatId?: ItemWrapperProps["chatId"];
  orderProposal?: ItemWrapperProps["orderProposal"];
  setItem: (item: ItemWrapperProps["item"]) => void;
  setItemOwnerData: (itemOwnerData: ItemWrapperProps["itemOwnerData"]) => void;
  setChatId: (chatId: ItemWrapperProps["chatId"]) => void;
  setOrderProposal: (orderProposal: ItemWrapperProps["orderProposal"]) => void;
  resetAll: () => void;
};

export const createItemDetailSlice: StateCreator<ItemDetailStore> = (set) => ({
  item: undefined,
  itemOwnerData: undefined,
  chatId: undefined,
  orderProposal: undefined,
  setItem: (item: ItemWrapperProps["item"]) => set({ item }),
  setItemOwnerData: (itemOwnerData: ItemWrapperProps["itemOwnerData"]) =>
    set({ itemOwnerData }),
  setChatId: (chatId: ItemWrapperProps["chatId"]) => set({ chatId }),
  setOrderProposal: (orderProposal: ItemWrapperProps["orderProposal"]) =>
    set({ orderProposal }),
  resetAll: () =>
    set({
      item: null as unknown as ItemWrapperProps["item"],
      itemOwnerData: null as unknown as ItemWrapperProps["itemOwnerData"],
      chatId: undefined,
      orderProposal: undefined,
    }),
});
