'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';
import { Spinner } from '@workspace/ui/components/spinner';
import { SidebarProvider } from '@workspace/ui/components/sidebar';
import { ChatSidebar } from '#components/chat/chat-sidebar/index';
import { useAuth } from '#providers/auth-providers';
import { privateQueryKeys } from '@workspace/shared/utils/private-query-keys';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const { user } = useAuth();

	// Fetch current user data
	const { data: currentUser, isError: isUserError } = useQuery({
		queryKey: privateQueryKeys.currentUser(user?.profile_id),
		enabled: user !== null,
		queryFn: async () => {
			const response = await client.user.auth.$get();
			if (!response.ok) {
				throw new Error('Failed to fetch user');
			}
			const user = await response.json();
			return user;
		},
	});

	// Fetch chat rooms
	const { data: chatRooms, isError: isRoomsError } = useQuery({
		queryKey: privateQueryKeys.chatRooms(user?.profile_id),
		queryFn: async () => {
			const response = await client.chat.auth.rooms.$get();

			if (!response.ok) {
				console.log('Failed to fetch chat rooms');
				return [];
			}

			return await response.json();
		},
		// Only fetch chat rooms if we have a current user
		enabled: user !== null && !!currentUser,
	});

	// Handle authentication and data loading errors
	useEffect(() => {
		if (isUserError) {
			router.push('/login');
		}

		if (isRoomsError) {
			router.push('/404');
		}
	}, [isUserError, isRoomsError, router]);

	// Show loading state while data is being fetched
	if (!currentUser || !chatRooms) {
		return (
			<div className='flex h-[calc(100vh-4rem)] items-center justify-center'>
				<Spinner />
			</div>
		);
	}

	return (
		<SidebarProvider className='container mx-auto max-h-[calc(100vh-74px)] min-h-[calc(100vh-74px)] overflow-auto'>
			<div className='flex w-full'>
				<div className={pathname !== '/auth/chat' ? 'hidden xl:block xl:w-[450px]' : 'block w-full xl:w-[450px]'}>
					<ChatSidebar
						id='chat-sidebar'
						collapsable={pathname !== '/auth/chat' ? 'offcanvas' : 'none'}
						chatRooms={chatRooms}
						currentUserId={currentUser.id}
					/>
				</div>

				<main className='flex-1 overflow-hidden'>{children}</main>
			</div>
		</SidebarProvider>
	);
}
