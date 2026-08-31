import { devtools } from 'zustand/middleware';
import { create } from 'zustand';
import { createItemDetailSlice, ItemDetailStore } from './item-detail-store';
import { createProposalSlice, OrderProposalStore } from './proposal-store';
import { createNewItemSlice, NewItemStore } from './item-new';
import { createAddressSlice, AddressStore } from './address';
import { createBuyNowSlice, OrderBuyNowStore } from './buy-now-store';
import { commerceOwnerMatches, CommerceOwnershipState } from './commerce-ownership';

export type CommerceOwnershipStore = CommerceOwnershipState & {
	setCommerceContext: (profileId: number | null, itemId: number) => void;
	resetPrivateCommerceState: () => void;
};

type TantovaleStoreProps = ItemDetailStore &
	OrderProposalStore &
	NewItemStore &
	AddressStore &
	OrderBuyNowStore &
	CommerceOwnershipStore;

const privateCommerceResetState = {
	item: undefined,
	itemOwnerData: undefined,
	orderProposal: undefined,
	chatId: undefined,
	clientBuyNowOrderId: 0,
	clientBuyNowOrderStatus: '',
	isBuyNowModalOpen: false,
	isCreatingOrder: false,
	clientProposalId: undefined,
	clientProposalCreatedAt: undefined,
	isProposalModalOpen: false,
	isCreatingProposal: false,
	address_id: undefined,
	isAddressLoading: false,
} as const;

const useTantovaleStore = create<TantovaleStoreProps>()(
	devtools((set, get, ...a) => ({
		...createItemDetailSlice(set, get, ...a),
		...createProposalSlice(set, get, ...a),
		...createBuyNowSlice(set, get, ...a),
		...createNewItemSlice(set, get, ...a),
		...createAddressSlice(set, get, ...a),
		commerceOwnerProfileId: null,
		commerceOwnerItemId: null,
		setCommerceContext: (profileId, itemId) => {
			if (commerceOwnerMatches(get(), profileId, itemId)) return;
			set({ ...privateCommerceResetState, commerceOwnerProfileId: profileId, commerceOwnerItemId: itemId });
		},
		resetPrivateCommerceState: () => {
			set({ ...privateCommerceResetState, commerceOwnerProfileId: null, commerceOwnerItemId: null });
		},
	})),
);

export default useTantovaleStore;
