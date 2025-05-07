import { ItemWrapperProps } from "#app/item/[slug]/item-detail-wrapper/types";
import { StateCreator } from "zustand";

export type ItemDetailStore = {
  item?: ItemWrapperProps["item"];
  itemOwnerData?: ItemWrapperProps["itemOwnerData"];
  orderProposal?: ItemWrapperProps["orderProposal"];
  setItem: (item: ItemWrapperProps["item"]) => void;
  setItemOwnerData: (itemOwnerData: ItemWrapperProps["itemOwnerData"]) => void;
  setOrderProposal: (orderProposal: ItemWrapperProps["orderProposal"]) => void;
  resetAllItemDetail: () => void;
};

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
      item: null as unknown as ItemWrapperProps["item"],
      itemOwnerData: null as unknown as ItemWrapperProps["itemOwnerData"],
      orderProposal: undefined,
    }),
});
