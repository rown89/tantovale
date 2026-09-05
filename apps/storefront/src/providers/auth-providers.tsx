'use client';

import { client } from '@workspace/server/client-rpc';
import refreshTokens from '../utils/refreshTokens';
import { useRouter } from 'next/navigation';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { shouldRemovePrivateQuery } from '@workspace/shared/utils/private-query-keys';
import useTantovaleStore from '#stores';
import { commitClientIdentity, logoutClientSession } from '#utils/client-logout';
import { initializeAuthSession } from '#utils/auth-initialization';

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
	const authGenerationRef = useRef(0);
	const [loadingUser, setLoadingUser] = useState(true);
	const commitIdentity = useCallback((nextIdentity: User | null) => {
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
	const setUser = useCallback<React.Dispatch<React.SetStateAction<User | null>>>(
		(nextAction) => {
			authGenerationRef.current += 1;
			const nextIdentity = typeof nextAction === 'function' ? nextAction(userRef.current) : nextAction;
			commitIdentity(nextIdentity);
		},
		[commitIdentity],
	);

	const logout = useCallback(() => {
		authGenerationRef.current += 1;
		logoutClientSession({
			queryClient,
			resetPrivateCommerceState: useTantovaleStore.getState().resetPrivateCommerceState,
			clearIdentity: () => {
				userRef.current = null;
				setUserState(null);
			},
			navigateToLogout: () => router.push('/api/logout'),
		});
		setLoadingUser(false);
	}, [queryClient, router]);

	useEffect(() => {
		queryClient.removeQueries({
			predicate: ({ queryKey }) => shouldRemovePrivateQuery(queryKey, user?.profile_id),
		});
	}, [queryClient, user?.profile_id]);

	const initializeAuth = useCallback(
		async (generation: number) => {
			const isCurrent = () => authGenerationRef.current === generation;
			try {
				await initializeAuthSession<User>({
					verify: () => client.verify.$get({ credentials: 'include' }),
					refresh: refreshTokens,
					logout,
					logoutBackend: () => client.logout.auth.$post({ credentials: 'include' }),
					commit: commitIdentity,
					isCurrent,
				});
			} catch (error) {
				if (isCurrent()) {
					console.error('Error during authentication initialization:', error);
					commitIdentity(null);
				}
			} finally {
				if (isCurrent()) setLoadingUser(false);
			}
		},
		[commitIdentity, logout],
	);

	useEffect(() => {
		if (isLogged) {
			const generation = authGenerationRef.current + 1;
			authGenerationRef.current = generation;
			setLoadingUser(true);
			void initializeAuth(generation);
			return () => {
				if (authGenerationRef.current === generation) authGenerationRef.current += 1;
			};
		} else {
			authGenerationRef.current += 1;
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
