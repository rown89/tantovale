import { ItemWrapperProps } from "#app/item/[slug]/types";
import { StateCreator } from "zustand";

interface ItemDetailState {
  item?: ItemWrapperProps["item"];
  itemOwnerData?: ItemWrapperProps["itemOwnerData"];
  orderProposal?: ItemWrapperProps["orderProposal"];
}

interface ItemDetailActions {
  setItem: (item: ItemWrapperProps["item"]) => void;
  setItemOwnerData: (itemOwnerData: ItemWrapperProps["itemOwnerData"]) => void;
  setOrderProposal: (orderProposal: ItemWrapperProps["orderProposal"]) => void;
  resetAllItemDetail: () => void;
}

// Combine state and actions
export type ItemDetailStore = ItemDetailState & ItemDetailActions;

export const createItemDetailSlice: StateCreator<ItemDetailStore> = (set) => ({
  item: undefined,
  itemOwnerData: undefined,
  orderProposal: undefined,
  setItem: (item: ItemWrapperProps["item"]) => set({ item }),
  setItemOwnerData: (itemOwnerData: ItemWrapperProps["itemOwnerData"]) =>
    set({ itemOwnerData }),
  setOrderProposal: (orderProposal: ItemWrapperProps["orderProposal"]) =>
    set({ orderProposal }),
  resetAllItemDetail: () =>
    set({
      item: undefined,
      itemOwnerData: undefined,
      orderProposal: undefined,
    }),
});
