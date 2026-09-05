export type BuyNowPaymentActionHandle = {
	cancel(): void;
};

export async function finishBuyNowAction(input: {
	request: Promise<{ payment_url?: string }>;
	isCurrent(): boolean;
	onPaymentUrl(url: string): void;
	onError(): void;
	close(): void;
}): Promise<void> {
	try {
		const response = await input.request;
		if (!input.isCurrent()) return;
		if (response.payment_url) input.onPaymentUrl(response.payment_url);
		else input.onError();
	} catch {
		if (!input.isCurrent()) return;
		input.onError();
	}

	if (input.isCurrent()) input.close();
}

export function scheduleBuyNowPaymentAction(input: {
	paymentUrl: string;
	isCurrent(): boolean;
	subscribe(listener: () => void): () => void;
	onPending(): string | number;
	onCancel(notificationId: string | number): void;
	open(url: string): void;
	delayMs?: number;
}): BuyNowPaymentActionHandle {
	let active = true;
	let unsubscribe: () => void = () => undefined;
	const notificationId = input.onPending();
	const delayMs = input.delayMs ?? 3000;
	const timer = setTimeout(() => {
		if (!active) return;
		if (!input.isCurrent()) {
			handle.cancel();
			return;
		}
		active = false;
		unsubscribe();
		input.open(input.paymentUrl);
	}, delayMs);
	const handle: BuyNowPaymentActionHandle = {
		cancel() {
			if (!active) return;
			active = false;
			clearTimeout(timer);
			unsubscribe();
			input.onCancel(notificationId);
		},
	};

	unsubscribe = input.subscribe(() => {
		if (!input.isCurrent()) handle.cancel();
	});
	if (!input.isCurrent()) handle.cancel();

	return handle;
}
