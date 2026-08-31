import { describe, expect, it, vi } from 'vitest';

const authLifecyclePath = '../../../storefront/src/utils/auth-initialization';
const profileLogoutPath = '../../../storefront/src/app/auth/profile/components/menu/profile-logout';

describe('storefront client authentication lifecycle', () => {
	it('stops after one logout when refresh fails, without a second verification or identity commit', async () => {
		const { initializeAuthSession } = (await import(/* @vite-ignore */ authLifecyclePath)) as {
			initializeAuthSession(input: {
				verify(): Promise<Response>;
				refresh(): Promise<boolean>;
				logout(): void;
				logoutBackend(): Promise<unknown>;
				commit(user: unknown): void;
				isCurrent(): boolean;
			}): Promise<void>;
		};
		const verify = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
		const refresh = vi.fn().mockResolvedValue(false);
		const logout = vi.fn();
		const commit = vi.fn();
		const logoutBackend = vi.fn();

		await initializeAuthSession({ verify, refresh, logout, logoutBackend, commit, isCurrent: () => true });

		expect(verify).toHaveBeenCalledOnce();
		expect(refresh).toHaveBeenCalledOnce();
		expect(logout).toHaveBeenCalledOnce();
		expect(logoutBackend).not.toHaveBeenCalled();
		expect(commit).not.toHaveBeenCalled();
	});

	it('ignores a stale verification completion after cancellation', async () => {
		const { initializeAuthSession } = (await import(/* @vite-ignore */ authLifecyclePath)) as {
			initializeAuthSession(input: {
				verify(): Promise<Response>;
				refresh(): Promise<boolean>;
				logout(): void;
				logoutBackend(): Promise<unknown>;
				commit(user: unknown): void;
				isCurrent(): boolean;
			}): Promise<void>;
		};
		let release!: (response: Response) => void;
		let current = true;
		const verify = vi.fn().mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));
		const commit = vi.fn();
		const initialization = initializeAuthSession({
			verify,
			refresh: vi.fn(),
			logout: vi.fn(),
			logoutBackend: vi.fn(),
			commit,
			isCurrent: () => current,
		});
		current = false;
		release(new Response(JSON.stringify({ user: { profile_id: 17 } }), { status: 200 }));

		await initialization;
		expect(commit).not.toHaveBeenCalled();
	});

	it('uses the AuthProvider logout callback from the profile menu handler', async () => {
		const { createProfileLogoutHandler } = (await import(/* @vite-ignore */ profileLogoutPath)) as {
			createProfileLogoutHandler(logout: () => void): () => void;
		};
		const logout = vi.fn();

		createProfileLogoutHandler(logout)();

		expect(logout).toHaveBeenCalledOnce();
	});
});
