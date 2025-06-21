import { StateCreator } from "zustand";

export type NewItemStore = {
  isManualShipping: boolean;
  setIsManualShipping: (isManualShipping: boolean) => void;
  isPickup: boolean;
  setIsPickup: (isPickup: boolean) => void;
  easyPay: boolean;
  setEasyPay: (easyPay: boolean) => void;
};

export const createNewItemSlice: StateCreator<NewItemStore> = (set) => ({
  isManualShipping: false,
  setIsManualShipping: (isManualShipping: boolean) => set({ isManualShipping }),
  isPickup: false,
  setIsPickup: (isPickup: boolean) => set({ isPickup }),
  easyPay: false,
  setEasyPay: (easyPay: boolean) => set({ easyPay }),
});
