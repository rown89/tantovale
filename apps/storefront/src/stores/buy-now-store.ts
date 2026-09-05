import { StateCreator } from 'zustand';

import { client } from '@workspace/server/client-rpc';
import {
	captureCommerceOwner,
	captureCommerceRequest,
	commerceRequestMatches,
	CommerceOwnershipState,
	CommerceRequestSnapshot,
} from './commerce-ownership';

export type OrderBuyNowStore = {
	clientBuyNowOrderId: number;
	clientBuyNowOrderStatus: string;
	setClientBuyNowOrderId: (id: number) => void;
	isBuyNowModalOpen: boolean;
	isCreatingOrder: boolean;
	buyNowRequestToken: number;
	setIsBuyNowModalOpen: (isBuyNowModalOpen: boolean) => void;
	setIsCreatingOrder: (isCreatingOrder: boolean) => void;
	handleBuyNow: (item_id: number) => Promise<BuyNowResponse>;
	resetBuyNowStore: () => void;
};

type BuyNowResponse = {
	success: boolean;
	order?: unknown;
	payment_url?: string;
	message?: string;
	error?: string;
};

export function captureBuyNowRequest(
	state: CommerceOwnershipState & Pick<OrderBuyNowStore, 'buyNowRequestToken'>,
): CommerceRequestSnapshot {
	return captureCommerceRequest(state, state.buyNowRequestToken);
}

export function buyNowRequestMatches(
	state: Partial<CommerceOwnershipState> & Pick<OrderBuyNowStore, 'buyNowRequestToken'>,
	snapshot: CommerceRequestSnapshot,
): boolean {
	return commerceRequestMatches(state, snapshot, state.buyNowRequestToken);
}

export const createBuyNowSlice: StateCreator<OrderBuyNowStore & CommerceOwnershipState, [], [], OrderBuyNowStore> = (
	set,
	get,
) => ({
	clientBuyNowOrderId: 0,
	clientBuyNowOrderStatus: '',
	isBuyNowModalOpen: false,
	isCreatingOrder: false,
	buyNowRequestToken: 0,
	setClientBuyNowOrderId: (id) => set({ clientBuyNowOrderId: id }),
	setIsBuyNowModalOpen: (isBuyNowModalOpen) => set({ isBuyNowModalOpen }),
	setIsCreatingOrder: (isCreatingOrder) => set({ isCreatingOrder }),
	handleBuyNow: async (item_id: number): Promise<BuyNowResponse> => {
		const requestOwner = captureCommerceOwner(get());
		if (requestOwner.commerceOwnerItemId !== item_id) {
			return { success: false, error: 'Commerce context changed' };
		}
		const requestToken = get().buyNowRequestToken + 1;
		const requestSnapshot = captureCommerceRequest(requestOwner, requestToken);
		set({
			isCreatingOrder: true,
			buyNowRequestToken: requestToken,
		});

		try {
			const responseCreateOrder = await client.item.auth.buy_now.$post({
				json: {
					item_id,
				},
			});

			if (!responseCreateOrder.ok) {
				return {
					success: false,
					error: 'Failed to create order',
				};
			}

			const { success, order, payment_url, message } = await responseCreateOrder.json();
			if (!buyNowRequestMatches(get(), requestSnapshot)) {
				return { success: false, error: 'Commerce context changed' };
			}

			if (!success) {
				return {
					success,
					error: message,
				};
			}

			set({ clientBuyNowOrderId: order.id, clientBuyNowOrderStatus: order.status });

			return {
				success,
				order,
				payment_url,
				message,
			};
		} finally {
			if (buyNowRequestMatches(get(), requestSnapshot)) {
				set({ isCreatingOrder: false });
			}
		}
	},
	resetBuyNowStore: () =>
		set({
			clientBuyNowOrderId: 0,
			clientBuyNowOrderStatus: '',
			isBuyNowModalOpen: false,
			isCreatingOrder: false,
			buyNowRequestToken: get().buyNowRequestToken + 1,
		}),
});
