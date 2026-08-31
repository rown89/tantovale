'use client';

import { client } from '@workspace/server/client-rpc';
import refreshTokens from '../utils/refreshTokens';
import { useRouter } from 'next/navigation';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { shouldRemovePrivateQuery } from '@workspace/shared/utils/private-query-keys';
import useTantovaleStore from '#stores';
import { commitClientIdentity, logoutClientSession } from '#utils/client-logout';

export interface User {
	id: number;
	profile_id: number;
	username: string;
	email: string;
	email_verified: boolean;
	phone_verified: boolean;
	exp: number;
}

interface AuthContextType {
	user: User | null;
	loadingUser: boolean;
	logout: VoidFunction;
	setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ isLogged, children }: { isLogged: boolean; children: ReactNode }) => {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [user, setUserState] = useState<User | null>(null);
	const userRef = useRef<User | null>(null);
	const [loadingUser, setLoadingUser] = useState(true);
	const setUser = useCallback<React.Dispatch<React.SetStateAction<User | null>>>((nextAction) => {
		const nextIdentity = typeof nextAction === 'function' ? nextAction(userRef.current) : nextAction;
		commitClientIdentity({
			currentIdentity: userRef.current,
			nextIdentity,
			resetPrivateCommerceState: useTantovaleStore.getState().resetPrivateCommerceState,
			commit: (identity) => {
				userRef.current = identity;
				setUserState(identity);
			},
		});
	}, []);

	const logout = useCallback(() => {
		logoutClientSession({
			queryClient,
			resetPrivateCommerceState: useTantovaleStore.getState().resetPrivateCommerceState,
			clearIdentity: () => {
				userRef.current = null;
				setUserState(null);
			},
			navigateToLogout: () => router.push('/api/logout'),
		});
	}, [queryClient, router]);

	useEffect(() => {
		queryClient.removeQueries({
			predicate: ({ queryKey }) => shouldRemovePrivateQuery(queryKey, user?.profile_id),
		});
	}, [queryClient, user?.profile_id]);

	const initializeAuth = useCallback(async () => {
		try {
			// Attempt to verify the user with the current token.
			let res = await client.verify.$get({
				credentials: 'include',
			});

			// If verification fails, attempt to refresh the token.
			if (!res.ok) {
				const refreshed = await refreshTokens();

				// If refresh fails, log out the user.
				if (!refreshed) logout();

				// After a successful refresh, try verifying again.
				res = await client.verify.$get({
					credentials: 'include',
				});
			}

			// If verification is ok set the user
			if (res.ok) {
				const data = await res.json();

				setUser(data.user);
			} else {
				// If verification still fails, log out.
				await client.logout.auth.$post({
					credentials: 'include',
				});

				setUser(null);
			}
		} catch (error) {
			console.error('Error during authentication initialization:', error);
			setUser(null);
		} finally {
			setLoadingUser(false);
		}
	}, [logout, setUser]);

	useEffect(() => {
		if (isLogged) {
			initializeAuth();
		} else {
			setLoadingUser(false);
		}
	}, [initializeAuth, isLogged]);

	return <AuthContext.Provider value={{ user, loadingUser, setUser, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
};
