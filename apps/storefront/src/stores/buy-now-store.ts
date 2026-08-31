import { StateCreator } from 'zustand';

import { client } from '@workspace/server/client-rpc';
import { commerceOwnerMatches, CommerceOwnershipState } from './commerce-ownership';

export type OrderBuyNowStore = {
	clientBuyNowOrderId: number;
	clientBuyNowOrderStatus: string;
	setClientBuyNowOrderId: (id: number) => void;
	isBuyNowModalOpen: boolean;
	isCreatingOrder: boolean;
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

export const createBuyNowSlice: StateCreator<OrderBuyNowStore & CommerceOwnershipState, [], [], OrderBuyNowStore> = (
	set,
	get,
) => ({
	clientBuyNowOrderId: 0,
	clientBuyNowOrderStatus: '',
	isBuyNowModalOpen: false,
	isCreatingOrder: false,
	setClientBuyNowOrderId: (id) => set({ clientBuyNowOrderId: id }),
	setIsBuyNowModalOpen: (isBuyNowModalOpen) => set({ isBuyNowModalOpen }),
	setIsCreatingOrder: (isCreatingOrder) => set({ isCreatingOrder }),
	handleBuyNow: async (item_id: number): Promise<BuyNowResponse> => {
		const requestOwner = {
			commerceOwnerProfileId: get().commerceOwnerProfileId,
			commerceOwnerItemId: get().commerceOwnerItemId,
		};
		if (requestOwner.commerceOwnerItemId !== item_id) {
			return { success: false, error: 'Commerce context changed' };
		}
		set({
			isCreatingOrder: true,
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
			if (!commerceOwnerMatches(get(), requestOwner.commerceOwnerProfileId, requestOwner.commerceOwnerItemId)) {
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
			if (commerceOwnerMatches(get(), requestOwner.commerceOwnerProfileId, requestOwner.commerceOwnerItemId)) {
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
		}),
});
