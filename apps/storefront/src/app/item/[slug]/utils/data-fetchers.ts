import { client } from '@workspace/server/client-rpc';
import { AuthTokens } from '#shared/auth-tokens';

// Utility function to create auth headers
export function createAuthHeaders(authTokens: AuthTokens): Record<string, string> | undefined {
	if (!authTokens.accessToken || !authTokens.refreshToken) return undefined;

	return {
		cookie: `access_token=${authTokens.accessToken}; refresh_token=${authTokens.refreshToken};`,
	};
}

// Data fetching functions - separated for better maintainability
export async function fetchItemData(id: string) {
	const response = await client.item[':id'].$get({
		param: { id },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch item: ${response.status}`);
	}

	const item = await response.json();
	return item;
}

export async function fetchItemOwnerData(username: string) {
	const response = await client.profile.compact[':username'].$get({
		param: { username },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch item owner data: ${response.status}`);
	}

	const itemOwnerData = await response.json();

	return itemOwnerData;
}

export async function fetchUserData(authHeaders: Record<string, string>) {
	const response = await client.verify.$get({ credentials: 'include' }, { headers: authHeaders });

	if (!response.ok) {
		return null; // User not authenticated, return null instead of throwing
	}

	const data = await response.json();

	const user = data.user;

	return user;
}

export async function fetchChatData(itemId: string, authHeaders: Record<string, string>) {
	try {
		const response = await client.chat.auth.rooms.id[':item_id'].$get(
			{ param: { item_id: itemId } },
			{ headers: authHeaders },
		);

		if (!response.ok) return undefined;

		const chat = await response.json();

		const chatId = chat.id;

		return chatId;
	} catch (error) {
		console.warn('Failed to fetch chat data:', error);
		return undefined;
	}
}

export async function fetchOrderProposalData(itemId: string, authHeaders: Record<string, string>) {
	try {
		const response = await client.orders_proposals.auth.by_item[':item_id'].$get(
			{
				param: { item_id: itemId },
				query: { status: 'pending' },
			},
			{ headers: authHeaders },
		);

		if (!response.ok) return undefined;

		const orderProposal = await response.json();

		return orderProposal;
	} catch (error) {
		console.warn('Failed to fetch order proposal data:', error);
		return undefined;
	}
}

export async function fetchFavoriteStatus(itemId: string, authHeaders: Record<string, string>) {
	try {
		const response = await client.favorites.auth.check[':item_id'].$get(
			{ param: { item_id: itemId } },
			{ headers: authHeaders },
		);

		if (!response.ok) return false;

		const isFavorite = await response.json();

		return isFavorite;
	} catch (error) {
		console.warn('Failed to fetch favorite status:', error);
		return false;
	}
}
