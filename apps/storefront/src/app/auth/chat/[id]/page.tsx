'use client';

import { notFound, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { client } from '@workspace/server/client-rpc';
import { Chat } from '#components/chat';
import { useAuth } from '#providers/auth-providers';
import { privateQueryKeys } from '@workspace/shared/utils/private-query-keys';

export default function ChatRoomPage() {
	const params = useParams<{ id: string }>();
	const { user } = useAuth();
	const { id } = params;

	const chatRoomId = Number.parseInt(id);

	if (isNaN(chatRoomId)) notFound();

	const { data: currentUser } = useQuery({
		queryKey: privateQueryKeys.currentUser(user?.profile_id),
		enabled: user !== null,
		queryFn: async () => {
			const response = await client.user.auth.$get();

			if (!response.ok) {
				console.log('currentUser error', response);
				return undefined;
			}

			return await response.json();
		},
	});

	const { data: chatRooms, isError: isChatRoomsError } = useQuery({
		queryKey: privateQueryKeys.chatRooms(user?.profile_id),
		enabled: user !== null,
		queryFn: async () => {
			const response = await client.chat.auth.rooms.$get();

			if (!response.ok) {
				console.log('chatRooms error', response);
				return undefined;
			}

			return await response.json();
		},
	});

	const { data: messages, isError: isMessagesError } = useQuery({
		queryKey: privateQueryKeys.chatMessages(user?.profile_id, id),
		enabled: user !== null,
		queryFn: async () => {
			const response = await client.chat.auth.rooms[':roomId'].messages.$get({
				param: { roomId: id },
			});

			if (!response.ok) {
				console.log('chatRooms error', response);
				return undefined;
			}

			return await response.json();
		},
	});

	if (isChatRoomsError || isMessagesError) notFound();

	const chatRoom = chatRooms?.find((room) => room.id === chatRoomId);

	if (!chatRoom) notFound();

	const currentUserId = Number(currentUser?.id);

	return <Chat chatRoom={chatRoom} messages={messages} currentUserId={currentUserId} />;
}
