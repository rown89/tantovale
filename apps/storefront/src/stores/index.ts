import { devtools } from 'zustand/middleware';
import { create } from 'zustand';
import { createItemDetailSlice, ItemDetailStore } from './item-detail-store';
import { createProposalSlice, OrderProposalStore } from './proposal-store';
import { createNewItemSlice, NewItemStore } from './item-new';
import { createAddressSlice, AddressStore } from './address';
import { createBuyNowSlice, OrderBuyNowStore } from './buy-now-store';

type TantovaleStoreProps = ItemDetailStore & OrderProposalStore & NewItemStore & AddressStore & OrderBuyNowStore;

const useTantovaleStore = create<TantovaleStoreProps>()(
	devtools((...a) => ({
		...createItemDetailSlice(...a),
		...createProposalSlice(...a),
		...createBuyNowSlice(...a),
		...createNewItemSlice(...a),
		...createAddressSlice(...a),
	})),
);

export default useTantovaleStore;
