"use client";

import { useEffect, useRef } from "react";
import { ChatHeader } from "./chat-header";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";

export interface ChatProps {
  currentUserId: number;
  chatRoom: {
    id: number;
    item: {
      id: number;
      title: string;
      price: number;
    };
    author: {
      id: number | null;
      username: string;
    };
    buyer: {
      id: number;
      username: string;
    };
  };

  messages:
    | {
        id: number;
        message: string;
        created_at: string;
        read_at: string | null;
        sender: {
          id: number;
          username: string;
        };
      }[]
    | undefined;
}

export function Chat({ chatRoom, messages, currentUserId }: ChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <ChatHeader chatRoom={chatRoom} currentUserId={currentUserId} />
      <div className="flex-1 overflow-y-auto p-4">
        {messages && messages?.length > 0 ? (
          messages?.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isCurrentUser={message.sender.id === currentUserId}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput chatRoomId={chatRoom.id} />
    </div>
  );
}
