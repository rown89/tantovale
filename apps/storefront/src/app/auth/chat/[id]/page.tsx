"use client";

import { Chat } from "#components/chat";
import { client } from "@workspace/shared/clients/rpc-client";
import { notFound, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const { id } = params;

  const chatRoomId = Number.parseInt(id);

  if (isNaN(chatRoomId)) notFound();

  const { data: chatRooms, isError: isChatRoomsError } = useQuery({
    queryKey: ["chatRooms"],
    queryFn: async () => {
      const response = await client.auth.chat.rooms.$get();
      console.log("porco2");

      if (!response.ok) {
        console.log("chatRooms error", response);
      }

      return await response.json();
    },
  });
  const { data: messages, isError: isMessagesError } = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const response = await client.auth.chat.rooms[":roomId"].messages.$get({
        param: { roomId: id },
      });
      console.log("porco3");

      if (!response.ok) {
        console.log("chatRooms error", response);

        return [];
      }

      return await response.json();
    },
  });

  if (isChatRoomsError || isMessagesError) notFound();

  const chatRoom = chatRooms?.find((room) => room.id === chatRoomId);

  if (!chatRoom) notFound();

  const currentUserId = chatRoom.buyer.id;

  return (
    <Chat
      chatRoom={chatRoom}
      messages={messages}
      currentUserId={currentUserId}
    />
  );
}
