import { devtools } from 'zustand/middleware';
import { create } from 'zustand';
import { createItemDetailSlice, ItemDetailStore } from './item-detail-store';
import { createProposalSlice, OrderProposalStore } from './proposal-store';
import { createNewItemSlice, NewItemStore } from './item-new';
import { createAddressSlice, AddressStore } from './address';

type TantovaleStoreProps = ItemDetailStore & OrderProposalStore & NewItemStore & AddressStore;

const useTantovaleStore = create<TantovaleStoreProps>()(
	devtools((...a) => ({
		...createItemDetailSlice(...a),
		...createProposalSlice(...a),
		...createNewItemSlice(...a),
		...createAddressSlice(...a),
	})),
);

export default useTantovaleStore;
