'use client';

import { useEffect, useRef } from 'react';
import { ChatHeader } from './chat-header';
import { ChatInput } from './chat-input';
import { ItemStatus } from '@workspace/server/enumerated_values';
import { ChatMessage } from './chat-message/types';
import { ChatMessage as ChatMessageComponent } from './chat-message';

export interface ChatItem {
	id: number;
	title: string;
	price: number;
	published: boolean;
	status: ItemStatus;
}

export interface ChatProps {
	currentUserId: number;
	chatRoom: {
		id: number;
		item: ChatItem;
		author: {
			id: number | null;
			username: string;
		};
		buyer: {
			id: number;
			username: string;
		};
	};
	messages: ChatMessage[] | undefined;
}

export function Chat({ chatRoom, messages, currentUserId }: ChatProps) {
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	return (
		<div className='flex h-full flex-col'>
			<ChatHeader id='chat-header' room={chatRoom} currentUserId={currentUserId} />
			<div className='flex-1 overflow-y-auto px-8 py-4'>
				{messages && messages?.length > 0 ? (
					messages?.map((message) => (
						<ChatMessageComponent
							key={message.id}
							message={message}
							item={chatRoom.item}
							isChatOwner={message.sender.id === currentUserId}
						/>
					))
				) : (
					<div className='text-muted-foreground flex h-full flex-col items-center justify-center'>
						<p>No messages yet.</p>
						<p>Start the conversation!</p>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>
			<ChatInput chatRoomId={chatRoom.id} />
		</div>
	);
}
