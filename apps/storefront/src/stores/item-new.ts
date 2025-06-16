import { StateCreator } from "zustand";

export type NewItemStore = {
  isManualShipping: boolean;
  isPickup: boolean;
  setIsManualShipping: (isManualShipping: boolean) => void;
  setIsPickup: (isPickup: boolean) => void;
};

export const createNewItemSlice: StateCreator<NewItemStore> = (set) => ({
  setIsManualShipping: (isManualShipping: boolean) => set({ isManualShipping }),
  setIsPickup: (isPickup: boolean) => set({ isPickup }),
  isManualShipping: false,
  isPickup: false,
});
