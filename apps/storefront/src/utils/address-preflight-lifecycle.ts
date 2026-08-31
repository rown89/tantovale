export type AddressPreflightResult = 'ready' | 'missing' | 'failed' | 'stale';

type AddressPreflightInput = {
	request(): Promise<number | false | null>;
	isOwnerCurrent(): boolean;
	setLoading(value: boolean): void;
	onAddress(addressId: number): void;
	onMissing(): void;
	onError(): void;
};

export function createAddressPreflightController() {
	let activeRequestToken = 0;

	return {
		async run(input: AddressPreflightInput): Promise<AddressPreflightResult> {
			const requestToken = ++activeRequestToken;
			const isCurrent = () => requestToken === activeRequestToken && input.isOwnerCurrent();
			if (!isCurrent()) return 'stale';
			input.setLoading(true);

			try {
				const addressId = await input.request();
				if (!isCurrent()) return 'stale';
				if (!addressId) {
					input.onMissing();
					return 'missing';
				}
				input.onAddress(addressId);
				return 'ready';
			} catch {
				if (!isCurrent()) return 'stale';
				input.onError();
				return 'failed';
			} finally {
				if (isCurrent()) input.setLoading(false);
			}
		},
		invalidate() {
			activeRequestToken += 1;
		},
	};
}
