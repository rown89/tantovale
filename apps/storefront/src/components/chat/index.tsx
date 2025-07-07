'use client';

import { useEffect, useRef } from 'react';

import { ChatHeader } from './chat-header';
import { ChatInput } from './chat-input';
import { ChatMessage as ChatMessageComponent } from './chat-message';
import { ChatRoomType, ChatMessageType } from './types';

export interface ChatProps {
	currentUserId: number;
	chatRoom: ChatRoomType;
	messages: ChatMessageType[] | undefined;
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
					messages?.map((chatMessageProps) => (
						<ChatMessageComponent
							key={chatMessageProps.id}
							chatMessageProps={chatMessageProps}
							item={chatRoom.item}
							isChatOwner={chatMessageProps.sender.id === currentUserId}
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
