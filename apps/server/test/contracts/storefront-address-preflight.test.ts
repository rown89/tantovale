import { describe, expect, it, vi } from 'vitest';

const preflightPath = '../../../storefront/src/utils/address-preflight-lifecycle';

async function loadController() {
	return import(/* @vite-ignore */ preflightPath) as Promise<{
		createAddressPreflightController(): {
			run(input: {
				request(): Promise<number | false>;
				isOwnerCurrent(): boolean;
				setLoading(value: boolean): void;
				onAddress(addressId: number): void;
				onMissing(): void;
				onError(): void;
			}): Promise<'ready' | 'missing' | 'failed' | 'stale'>;
			invalidate(): void;
		};
	}>;
}

describe('storefront address preflight lifecycle', () => {
	it.each(['profile', 'item', 'logout'] as const)(
		'ignores an old successful response after a %s context change',
		async () => {
			const { createAddressPreflightController } = await loadController();
			const controller = createAddressPreflightController();
			let release!: (addressId: number) => void;
			let ownerCurrent = true;
			const events: string[] = [];
			const pending = controller.run({
				request: () => new Promise<number>((resolve) => (release = resolve)),
				isOwnerCurrent: () => ownerCurrent,
				setLoading: (value) => events.push(`loading:${value}`),
				onAddress: (id) => events.push(`address:${id}`),
				onMissing: () => events.push('missing'),
				onError: () => events.push('error'),
			});

			ownerCurrent = false;
			controller.invalidate();
			release(41);

			await expect(pending).resolves.toBe('stale');
			expect(events).toEqual(['loading:true']);
		},
	);

	it('does not let an old finalizer clear loading for a newer request', async () => {
		const { createAddressPreflightController } = await loadController();
		const controller = createAddressPreflightController();
		let releaseOld!: (addressId: number) => void;
		let releaseNew!: (addressId: number) => void;
		const loading: boolean[] = [];
		const addresses: number[] = [];
		const input = (request: () => Promise<number>) => ({
			request,
			isOwnerCurrent: () => true,
			setLoading: (value: boolean) => loading.push(value),
			onAddress: (id: number) => addresses.push(id),
			onMissing: vi.fn(),
			onError: vi.fn(),
		});
		const oldRequest = controller.run(input(() => new Promise<number>((resolve) => (releaseOld = resolve))));
		const newRequest = controller.run(input(() => new Promise<number>((resolve) => (releaseNew = resolve))));

		releaseOld(41);
		await expect(oldRequest).resolves.toBe('stale');
		expect(loading).toEqual([true, true]);
		releaseNew(42);
		await expect(newRequest).resolves.toBe('ready');

		expect(addresses).toEqual([42]);
		expect(loading).toEqual([true, true, false]);
	});

	it('fails closed and always releases loading for missing, non-ok, and thrown address checks', async () => {
		const { createAddressPreflightController } = await loadController();
		for (const [request, expected] of [
			[() => Promise.resolve(false as const), 'missing'],
			[() => Promise.reject(new Error('network')), 'failed'],
		] as const) {
			const controller = createAddressPreflightController();
			const loading: boolean[] = [];
			const onMissing = vi.fn();
			const onError = vi.fn();
			const result = await controller.run({
				request,
				isOwnerCurrent: () => true,
				setLoading: (value) => loading.push(value),
				onAddress: vi.fn(),
				onMissing,
				onError,
			});

			expect(loading).toEqual([true, false]);
			expect(result).toBe(expected);
			if (result === 'missing') expect(onMissing).toHaveBeenCalledOnce();
			if (result === 'failed') expect(onError).toHaveBeenCalledOnce();
		}
	});
});
