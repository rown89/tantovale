import { devtools } from 'zustand/middleware';
import { create } from 'zustand';
import { createItemDetailSlice, ItemDetailStore } from './item-detail-store';
import { createProposalSlice, OrderProposalStore } from './proposal-store';
import { createNewItemSlice, NewItemStore } from './item-new';
import { createAddressSlice, AddressStore } from './address';
import { createBuyNowSlice, OrderBuyNowStore } from './buy-now-store';
import { CommerceOwnershipState } from './commerce-ownership';

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
	buyNowRequestToken: 0,
	clientProposalId: undefined,
	clientProposalCreatedAt: undefined,
	isProposalModalOpen: false,
	isCreatingProposal: false,
	proposalRequestToken: 0,
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
		commerceOwnerEpoch: 0,
		setCommerceContext: (profileId, itemId) => {
			set({
				...privateCommerceResetState,
				commerceOwnerProfileId: profileId,
				commerceOwnerItemId: itemId,
				commerceOwnerEpoch: get().commerceOwnerEpoch + 1,
			});
		},
		resetPrivateCommerceState: () => {
			set({
				...privateCommerceResetState,
				commerceOwnerProfileId: null,
				commerceOwnerItemId: null,
				commerceOwnerEpoch: get().commerceOwnerEpoch + 1,
			});
		},
	})),
);

export default useTantovaleStore;
