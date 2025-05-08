"use client";

import { useEffect, useRef } from "react";
import { ChatHeader } from "./chat-header";
import { ChatInput } from "./chat-input";
import { ItemStatus } from "@workspace/server/enumerated_values";
import { ChatMessage } from "./chat-message/types";
import { ChatMessage as ChatMessageComponent } from "./chat-message";

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <ChatHeader
        id="chat-header"
        room={chatRoom}
        currentUserId={currentUserId}
      />
      <div className="flex-1 overflow-y-auto py-4 px-8">
        {messages && messages?.length > 0 ? (
          messages?.map((message) => (
            <ChatMessageComponent
              key={message.id}
              message={message}
              item={chatRoom.item}
              isCurrentUser={message.sender.id === currentUserId}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center flex-col text-muted-foreground">
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
