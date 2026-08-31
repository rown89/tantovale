import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const privateQueryModulePath = '../../../../packages/shared/src/utils/private-query-keys';

async function loadPrivateQueryKeys() {
	return import(/* @vite-ignore */ privateQueryModulePath) as Promise<{
		privateQueryKeys: {
			chatMessages(profileId: number | undefined, roomId: number | string | undefined): readonly unknown[];
			chatRooms(profileId: number | undefined): readonly unknown[];
			currentUser(profileId: number | undefined): readonly unknown[];
			favorites(profileId: number | undefined): readonly unknown[];
			orderProposal(profileId: number | undefined, proposalId: number | undefined): readonly unknown[];
			orders(profileId: number | undefined, status: string): readonly unknown[];
			sellingItems(profileId: number | undefined, publishedType: string): readonly unknown[];
		};
		shouldRemovePrivateQuery(queryKey: readonly unknown[], activeProfileId?: number): boolean;
	}>;
}

describe('storefront private React Query cache identity', () => {
	it('namespaces payment-bearing orders and chat/favorites data by authenticated profile', async () => {
		const { privateQueryKeys } = await loadPrivateQueryKeys();
		const cache = new Map<string, unknown>();
		cache.set(JSON.stringify(privateQueryKeys.orders(17, 'all')), {
			payment_url: 'https://payments.invalid/private-user-17',
		});
		cache.set(JSON.stringify(privateQueryKeys.chatMessages(17, 41)), [{ text: 'private chat' }]);
		cache.set(JSON.stringify(privateQueryKeys.favorites(17)), [{ id: 99 }]);

		expect(privateQueryKeys.orders(17, 'all')).toEqual(['private', 17, 'orders', 'all']);
		expect(privateQueryKeys.orders(23, 'all')).not.toEqual(privateQueryKeys.orders(17, 'all'));
		expect(privateQueryKeys.currentUser(17)).toEqual(['private', 17, 'currentUser']);
		expect(privateQueryKeys.chatRooms(17)).toEqual(['private', 17, 'chatRooms']);
		expect(privateQueryKeys.chatMessages(17, 41)).toEqual(['private', 17, 'chat-messages', 41]);
		expect(privateQueryKeys.favorites(17)).toEqual(['private', 17, 'get_user_favorites']);
		expect(privateQueryKeys.sellingItems(17, 'published')).toEqual(['private', 17, 'user-selling-items', 'published']);
		expect(privateQueryKeys.orderProposal(17, 53)).toEqual(['private', 17, 'orderProposal', 53]);
		expect(cache.get(JSON.stringify(privateQueryKeys.orders(23, 'all')))).toBeUndefined();
		expect(cache.get(JSON.stringify(privateQueryKeys.chatMessages(23, 41)))).toBeUndefined();
		expect(cache.get(JSON.stringify(privateQueryKeys.favorites(23)))).toBeUndefined();
	});

	it('wires every private storefront query and auth cache purge to the profile-scoped helpers', async () => {
		const expectedUsage = new Map([
			['../../../storefront/src/app/auth/profile/components/orders/index.tsx', 'privateQueryKeys.orders'],
			['../../../storefront/src/app/auth/profile/components/selling-items/index.tsx', 'privateQueryKeys.sellingItems'],
			['../../../storefront/src/app/auth/favorites/index.tsx', 'privateQueryKeys.favorites'],
			['../../../storefront/src/app/auth/chat/layout.tsx', 'privateQueryKeys.chatRooms'],
			['../../../storefront/src/app/auth/chat/[id]/page.tsx', 'privateQueryKeys.chatMessages'],
			['../../../storefront/src/components/chat/chat-input/index.tsx', 'privateQueryKeys.chatMessages'],
			['../../../storefront/src/components/chat/chat-message/use-chat-message.ts', 'privateQueryKeys.orderProposal'],
			['../../../storefront/src/providers/auth-providers.tsx', 'shouldRemovePrivateQuery'],
		]);

		for (const [path, helper] of expectedUsage) {
			const source = await readFile(new URL(path, import.meta.url), 'utf8');
			expect(source, path).toContain(helper);
		}
	});

	it('purges another identity or every logged-out private query without touching public cache', async () => {
		const { privateQueryKeys, shouldRemovePrivateQuery } = await loadPrivateQueryKeys();
		const firstUserOrders = privateQueryKeys.orders(17, 'all');
		const firstUserChat = privateQueryKeys.chatMessages(17, 41);
		const secondUserFavorites = privateQueryKeys.favorites(23);

		expect(shouldRemovePrivateQuery(firstUserOrders, 23)).toBe(true);
		expect(shouldRemovePrivateQuery(firstUserChat, 23)).toBe(true);
		expect(shouldRemovePrivateQuery(secondUserFavorites, 23)).toBe(false);
		expect(shouldRemovePrivateQuery(firstUserOrders)).toBe(true);
		expect(shouldRemovePrivateQuery(['categories'], 23)).toBe(false);
		expect(shouldRemovePrivateQuery(['item', 99])).toBe(false);
	});
});
