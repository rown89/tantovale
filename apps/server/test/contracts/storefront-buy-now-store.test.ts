import { beforeEach, describe, expect, it, vi } from 'vitest';

const buyNowStoreModulePath = '../../../storefront/src/stores/buy-now-store';

type BuyNowState = {
	commerceOwnerProfileId: number;
	commerceOwnerItemId: number;
	isCreatingOrder: boolean;
	clientBuyNowOrderId: number;
	clientBuyNowOrderStatus: string;
	handleBuyNow(itemId: number): Promise<{ success: boolean; error?: string }>;
};

async function createStore(post: () => Promise<unknown>, itemId: number) {
	vi.doMock('@workspace/server/client-rpc', () => ({
		client: { item: { auth: { buy_now: { $post: post } } } },
	}));
	const { createBuyNowSlice } = (await import(/* @vite-ignore */ buyNowStoreModulePath)) as {
		createBuyNowSlice(set: (partial: Partial<BuyNowState>) => void, get: () => BuyNowState, api: object): BuyNowState;
	};
	let state: BuyNowState;
	state = {
		...createBuyNowSlice(
			(partial) => {
				state = { ...state, ...partial };
			},
			() => state,
			{},
		),
		commerceOwnerProfileId: 17,
		commerceOwnerItemId: itemId,
	};
	return () => state;
}

describe('storefront Buy Now store', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it.each([
		['non-2xx response', async () => ({ ok: false })],
		[
			'success:false payload',
			async () => ({ ok: true, json: async () => ({ success: false, message: 'Provider rejected order' }) }),
		],
	] as const)('always releases the in-flight guard after a %s and allows retry', async (_label, firstResponse) => {
		const post = vi
			.fn()
			.mockImplementationOnce(firstResponse)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					order: { id: 71, status: 'payment_pending' },
					payment_url: 'https://payments.invalid/71',
				}),
			});
		const getState = await createStore(post, 11);

		await getState().handleBuyNow(11);
		expect(getState().isCreatingOrder).toBe(false);
		await expect(getState().handleBuyNow(11)).resolves.toMatchObject({ success: true });
		expect(getState()).toMatchObject({
			isCreatingOrder: false,
			clientBuyNowOrderId: 71,
			clientBuyNowOrderStatus: 'payment_pending',
		});
		expect(post).toHaveBeenCalledTimes(2);
	});

	it('releases the in-flight guard when the request throws and permits a later retry', async () => {
		const post = vi
			.fn()
			.mockRejectedValueOnce(new Error('network unavailable'))
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, order: { id: 72, status: 'payment_pending' } }),
			});
		const getState = await createStore(post, 12);

		await expect(getState().handleBuyNow(12)).rejects.toThrow('network unavailable');
		expect(getState().isCreatingOrder).toBe(false);
		await expect(getState().handleBuyNow(12)).resolves.toMatchObject({ success: true });
		expect(getState().isCreatingOrder).toBe(false);
	});
});
