import { describe, expect, it, vi } from 'vitest';

const chatMutationPath = '../../../storefront/src/components/chat/chat-input/chat-message-mutation';
const privateQueryModulePath = '../../../../packages/shared/src/utils/private-query-keys';
const reactQueryModulePath = '../../../storefront/node_modules/@tanstack/react-query/build/modern/index.js';

describe('storefront chat input mutation', () => {
	it('refetches an active URL-keyed chat query after a successful numeric-room send', async () => {
		const { createChatMessageMutationOptions } = (await import(/* @vite-ignore */ chatMutationPath)) as {
			createChatMessageMutationOptions(input: {
				profileId: number;
				roomId: number;
				post(message: string): Promise<Response>;
				queryClient: { invalidateQueries(input: { queryKey: readonly unknown[] }): Promise<void> };
				reset(): void;
			}): object;
		};
		const { privateQueryKeys } = (await import(/* @vite-ignore */ privateQueryModulePath)) as {
			privateQueryKeys: {
				chatMessages(profileId: number, roomId: number | string): readonly unknown[];
			};
		};
		const { MutationObserver, QueryClient, QueryObserver } = (await import(
			/* @vite-ignore */ reactQueryModulePath
		)) as {
			QueryClient: new (options?: object) => {
				setQueryData(key: readonly unknown[], data: unknown): void;
				invalidateQueries(input: { queryKey: readonly unknown[] }): Promise<void>;
			};
			QueryObserver: new (
				client: unknown,
				options: { queryKey: readonly unknown[]; queryFn(): Promise<unknown>; staleTime: number },
			) => { subscribe(listener: () => void): () => void };
			MutationObserver: new (client: unknown, options: object) => { mutate(value: string): Promise<unknown> };
		};
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const urlKey = privateQueryKeys.chatMessages(17, '41');
		let refetches = 0;
		queryClient.setQueryData(urlKey, [{ message: 'cached' }]);
		const observer = new QueryObserver(queryClient, {
			queryKey: urlKey,
			queryFn: async () => {
				refetches += 1;
				return [{ message: 'fresh' }];
			},
			staleTime: Number.POSITIVE_INFINITY,
		});
		const unsubscribe = observer.subscribe(() => undefined);
		const reset = vi.fn();
		const mutation = new MutationObserver(
			queryClient,
			createChatMessageMutationOptions({
				profileId: 17,
				roomId: 41,
				post: vi.fn().mockResolvedValue(new Response(null, { status: 201 })),
				queryClient,
				reset,
			}),
		);

		await mutation.mutate('hello');

		expect(refetches).toBe(1);
		expect(reset).toHaveBeenCalledOnce();
		unsubscribe();
	});

	it('does not reset or invalidate the chat query for a non-ok send', async () => {
		const { createChatMessageMutationOptions } = (await import(/* @vite-ignore */ chatMutationPath)) as {
			createChatMessageMutationOptions(input: {
				profileId: number;
				roomId: number;
				post(message: string): Promise<Response>;
				queryClient: { invalidateQueries(input: { queryKey: readonly unknown[] }): Promise<void> };
				reset(): void;
			}): { mutationFn(message: string): Promise<void>; onSuccess(): Promise<void> };
		};
		const reset = vi.fn();
		const invalidateQueries = vi.fn();
		const options = createChatMessageMutationOptions({
			profileId: 17,
			roomId: 41,
			post: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
			queryClient: { invalidateQueries },
			reset,
		});

		await expect(options.mutationFn('hello')).rejects.toThrow('Failed to send message');

		expect(reset).not.toHaveBeenCalled();
		expect(invalidateQueries).not.toHaveBeenCalled();
	});
});
