type AuthVerificationResponse = {
	ok: boolean;
	json(): Promise<unknown>;
};

export async function initializeAuthSession<User>(input: {
	verify(): Promise<AuthVerificationResponse>;
	refresh(): Promise<boolean>;
	logout(): void;
	logoutBackend(): Promise<unknown>;
	commit(user: User | null): void;
	isCurrent(): boolean;
}): Promise<void> {
	let response = await input.verify();
	if (!input.isCurrent()) return;

	if (!response.ok) {
		const refreshed = await input.refresh();
		if (!input.isCurrent()) return;
		if (!refreshed) {
			input.logout();
			return;
		}

		response = await input.verify();
		if (!input.isCurrent()) return;
	}

	if (response.ok) {
		const data = await response.json();
		if (typeof data !== 'object' || data === null || !('user' in data)) {
			throw new Error('Authentication verification returned an invalid response');
		}
		if (input.isCurrent()) input.commit(data.user as User);
		return;
	}

	await input.logoutBackend();
	if (input.isCurrent()) input.commit(null);
}
