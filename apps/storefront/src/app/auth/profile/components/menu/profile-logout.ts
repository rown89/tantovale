export function createProfileLogoutHandler(logout: () => void): () => void {
	return logout;
}
