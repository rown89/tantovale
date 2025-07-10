import { ItemDetailPageParams, ItemDetailData } from '../types';
import {
	createAuthHeaders,
	fetchItemData,
	fetchItemOwnerData,
	fetchUserData,
	fetchChatData,
	fetchFavoriteStatus,
} from './data-fetchers';

// Main data fetching function with parallel execution
export async function fetchItemDetailData({ id, authTokens }: ItemDetailPageParams): Promise<ItemDetailData> {
	const authHeaders = createAuthHeaders(authTokens);

	// Fetch core item data first (required for other requests)
	const item = await fetchItemData(id);

	// Parallel fetch of all dependent data
	const [itemOwnerData, userData, chatId, isFavorite] = await Promise.allSettled([
		fetchItemOwnerData(item.user.username),
		authHeaders ? fetchUserData(authHeaders) : Promise.resolve(null),
		authHeaders ? fetchChatData(id, authHeaders) : Promise.resolve(undefined),
		authHeaders ? fetchFavoriteStatus(id, authHeaders) : Promise.resolve(false),
	]);

	const fulfilled = 'fulfilled';

	// Handle results with proper error handling
	const resolvedItemOwnerData =
		itemOwnerData.status === fulfilled
			? itemOwnerData.value
			: (() => {
					throw new Error('Failed to fetch item owner data');
				})();

	const resolvedUserData = userData.status === fulfilled ? userData.value : null;
	const resolvedChatId = chatId.status === fulfilled ? chatId.value : undefined;
	const resolvedIsFavorite = isFavorite.status === fulfilled ? isFavorite.value : false;

	const isCurrentUserTheItemOwner = item.user.id === resolvedUserData?.id;

	return {
		item,
		itemOwnerData: resolvedItemOwnerData,
		chatId: resolvedChatId,
		isFavorite: resolvedIsFavorite,
		isCurrentUserTheItemOwner,
	};
}
