import { StateCreator } from 'zustand';

export type AddressStore = {
	address_id?: number;
	setAddressId: (address_id?: number) => void;
	isAddressLoading: boolean;
	setIsAddressLoading: (isAddressLoading: boolean) => void;
};

export const createAddressSlice: StateCreator<AddressStore> = (set) => ({
	address_id: undefined,
	setAddressId: (address_id?: number) => set({ address_id }),
	isAddressLoading: false,
	setIsAddressLoading: (isAddressLoading: boolean) => set({ isAddressLoading }),
});
