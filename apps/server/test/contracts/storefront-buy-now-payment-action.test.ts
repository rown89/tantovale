import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paymentActionPath = '../../../storefront/src/utils/buy-now-payment-action';

type RedirectHandle = { cancel(): void };

async function loadScheduler() {
	return import(/* @vite-ignore */ paymentActionPath) as Promise<{
		scheduleBuyNowPaymentAction(input: {
			paymentUrl: string;
			isCurrent(): boolean;
			subscribe(listener: () => void): () => void;
			onPending(): string | number;
			onCancel(notificationId: string | number): void;
			open(url: string): void;
			delayMs?: number;
		}): RedirectHandle;
		finishBuyNowAction(input: {
			request: Promise<{ payment_url?: string }>;
			isCurrent(): boolean;
			onPaymentUrl(url: string): void;
			onError(): void;
			close(): void;
		}): Promise<void>;
	}>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Buy Now delayed payment action', () => {
	it('does not show a toast or close the new context when an old request resolves', async () => {
		const { finishBuyNowAction } = await loadScheduler();
		let release!: (response: { payment_url: string }) => void;
		let current = true;
		const onPaymentUrl = vi.fn();
		const onError = vi.fn();
		const close = vi.fn();
		const completion = finishBuyNowAction({
			request: new Promise((resolve) => (release = resolve)),
			isCurrent: () => current,
			onPaymentUrl,
			onError,
			close,
		});

		current = false;
		release({ payment_url: 'https://payments.invalid/old' });
		await completion;

		expect(onPaymentUrl).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
	});

	it('schedules payment and closes exactly once for a current successful request', async () => {
		const { finishBuyNowAction } = await loadScheduler();
		const onPaymentUrl = vi.fn();
		const close = vi.fn();

		await finishBuyNowAction({
			request: Promise.resolve({ payment_url: 'https://payments.invalid/current' }),
			isCurrent: () => true,
			onPaymentUrl,
			onError: vi.fn(),
			close,
		});

		expect(onPaymentUrl).toHaveBeenCalledOnce();
		expect(onPaymentUrl).toHaveBeenCalledWith('https://payments.invalid/current');
		expect(close).toHaveBeenCalledOnce();
	});

	it.each(['account', 'item', 'logout'] as const)(
		'cancels redirect and toast when %s changes before delay',
		async () => {
			const { scheduleBuyNowPaymentAction } = await loadScheduler();
			let current = true;
			let ownerListener: () => void = () => undefined;
			const open = vi.fn();
			const dismiss = vi.fn();
			const handle = scheduleBuyNowPaymentAction({
				paymentUrl: 'https://payments.invalid/current',
				isCurrent: () => current,
				subscribe: (listener) => {
					ownerListener = listener;
					return vi.fn();
				},
				onPending: () => 'toast-1',
				onCancel: dismiss,
				open,
				delayMs: 3000,
			});

			current = false;
			ownerListener();
			await vi.advanceTimersByTimeAsync(3000);

			expect(open).not.toHaveBeenCalled();
			expect(dismiss).toHaveBeenCalledOnce();
			handle.cancel();
			expect(dismiss).toHaveBeenCalledOnce();
		},
	);

	it('rechecks ownership when the timer fires even without a subscription signal', async () => {
		const { scheduleBuyNowPaymentAction } = await loadScheduler();
		let current = true;
		const open = vi.fn();
		const dismiss = vi.fn();
		scheduleBuyNowPaymentAction({
			paymentUrl: 'https://payments.invalid/current',
			isCurrent: () => current,
			subscribe: () => vi.fn(),
			onPending: () => 'toast-1',
			onCancel: dismiss,
			open,
			delayMs: 3000,
		});

		current = false;
		await vi.advanceTimersByTimeAsync(3000);

		expect(open).not.toHaveBeenCalled();
		expect(dismiss).toHaveBeenCalledOnce();
	});

	it('opens the payment URL exactly once while the owner and request remain current', async () => {
		const { scheduleBuyNowPaymentAction } = await loadScheduler();
		const open = vi.fn();
		const dismiss = vi.fn();
		scheduleBuyNowPaymentAction({
			paymentUrl: 'https://payments.invalid/current',
			isCurrent: () => true,
			subscribe: () => vi.fn(),
			onPending: () => 'toast-1',
			onCancel: dismiss,
			open,
			delayMs: 3000,
		});

		await vi.advanceTimersByTimeAsync(6000);

		expect(open).toHaveBeenCalledOnce();
		expect(open).toHaveBeenCalledWith('https://payments.invalid/current');
		expect(dismiss).not.toHaveBeenCalled();
	});
});
