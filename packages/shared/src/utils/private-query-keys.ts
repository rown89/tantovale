export type PrivateProfileId = number | undefined;

export function privateQueryRoot(profileId: PrivateProfileId) {
	return ['private', profileId] as const;
}

export const privateQueryKeys = {
	currentUser: (profileId: PrivateProfileId) => [...privateQueryRoot(profileId), 'currentUser'] as const,
	chatRooms: (profileId: PrivateProfileId) => [...privateQueryRoot(profileId), 'chatRooms'] as const,
	chatMessages: (profileId: PrivateProfileId, roomId: number | string | undefined) =>
		[...privateQueryRoot(profileId), 'chat-messages', roomId] as const,
	favorites: (profileId: PrivateProfileId) => [...privateQueryRoot(profileId), 'get_user_favorites'] as const,
	sellingItems: (profileId: PrivateProfileId, publishedType: string) =>
		[...privateQueryRoot(profileId), 'user-selling-items', publishedType] as const,
	orders: (profileId: PrivateProfileId, status: string) => [...privateQueryRoot(profileId), 'orders', status] as const,
	orderProposal: (profileId: PrivateProfileId, proposalId: number | undefined) =>
		[...privateQueryRoot(profileId), 'orderProposal', proposalId] as const,
};

export function shouldRemovePrivateQuery(queryKey: readonly unknown[], activeProfileId?: number): boolean {
	if (queryKey[0] !== 'private') return false;
	return activeProfileId === undefined || queryKey[1] !== activeProfileId;
}
