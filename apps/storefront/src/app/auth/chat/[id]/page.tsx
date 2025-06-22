'use client';

import { notFound, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { client } from '@workspace/server/client-rpc';
import { Chat } from '#components/chat';

export default function ChatRoomPage() {
	const params = useParams<{ id: string }>();
	const { id } = params;

	const chatRoomId = Number.parseInt(id);

	if (isNaN(chatRoomId)) notFound();

	const { data: currentUser } = useQuery({
		queryKey: ['currentUser'],
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
		queryKey: ['chatRooms'],
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
		queryKey: ['chat-messages', id],
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
