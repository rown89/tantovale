import { StateCreator } from 'zustand';

import { client } from '@workspace/server/client-rpc';

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
	order?: any;
	payment_url?: string;
	message?: string;
	error?: string;
};

export const createBuyNowSlice: StateCreator<OrderBuyNowStore> = (set) => ({
	clientBuyNowOrderId: 0,
	clientBuyNowOrderStatus: '',
	isBuyNowModalOpen: false,
	isCreatingOrder: false,
	setClientBuyNowOrderId: (id) => set({ clientBuyNowOrderId: id }),
	setIsBuyNowModalOpen: (isBuyNowModalOpen) => set({ isBuyNowModalOpen }),
	setIsCreatingOrder: (isCreatingOrder) => set({ isCreatingOrder }),
	handleBuyNow: async (item_id: number): Promise<BuyNowResponse> => {
		set({
			isCreatingOrder: true,
		});

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

		if (!success) {
			return {
				success,
				error: message,
			};
		}

		set({ isCreatingOrder: false, clientBuyNowOrderId: order.id, clientBuyNowOrderStatus: order.status });

		return {
			success,
			order,
			payment_url,
			message,
		};
	},
	resetBuyNowStore: () => set({ clientBuyNowOrderId: 0, isBuyNowModalOpen: false }),
});
