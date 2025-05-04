import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { client } from "@workspace/server/client-rpc";
import { ChatMessageSchema } from "@workspace/server/extended_schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "#providers/auth-providers";

interface useItemDetailProps {
  user: User | null;
  item_id: number;
}

type schemaType = z.infer<typeof ChatMessageSchema>;

export function useItemDetail({ user, item_id }: useItemDetailProps) {
  const [isFavorite, setIsFavorite] = useState<boolean | null>(null);

  const queryClient = useQueryClient();

  // get chat id from item_id
  const {
    data: chatId,
    isLoading: isChatIdLoading,
    error: isChatIdError,
  } = useQuery({
    queryKey: ["get_chat_id_by_item"],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;

      const response = await client.chat.auth.rooms.id[":item_id"].$get({
        param: {
          item_id: String(item_id),
        },
      });

      if (!response.ok) return null;

      const chat = await response.json();

      return chat.id ?? 0;
    },
  });

  // Check if item_id is a user favorite
  const {
    data: isFavoriteData,
    isLoading: isFavoriteLoading,
    error: isFavoriteError,
  } = useQuery({
    queryKey: ["get_is_favorite_item"],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return false;

      const response = await client.favorites.auth.check[":item_id"].$get({
        param: {
          item_id: String(item_id),
        },
      });

      if (!response.ok) return false;

      const isFavorite = await response.json();

      setIsFavorite(isFavorite);

      return isFavorite;
    },
  });

  // Add item to favorites
  const handleFavorite = useMutation({
    mutationFn: async (action: "add" | "remove") => {
      const response = await client.favorites.auth.handle.$post({
        json: { item_id, action },
      });

      if (!response.ok) return false;

      return await response.json();
    },
    onSuccess: (value) => {
      setIsFavorite(value as boolean);
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
    },
  });

  const handlePayment = useMutation({
    mutationFn: async (price: number) => {
      const response = await client.orders_proposals.auth.create.$post({
        json: {
          item_id,
          price,
        },
      });

      if (!response.ok) return false;

      return await response.json();
    },
    onSuccess: (value) => {
      console.log("success", value);
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
    },
  });

  // Send message to user form
  const messageBoxForm = useForm({
    defaultValues: {
      message: "",
    },
    validators: {
      onSubmit: ChatMessageSchema,
    },
    onSubmit: async ({ value }: { value: schemaType }) => {
      const { message } = value;

      try {
        // create the room
        const charRoomResponse = await client.chat.auth.rooms.$post({
          json: {
            item_id,
          },
        });

        if (!charRoomResponse.ok) throw new Error("Error creating new room");

        const room = await charRoomResponse.json();

        // send the message to the created room
        const ChatRoomMessageResponse = await client.chat.auth.rooms[
          ":roomId"
        ].messages.$post({
          param: {
            roomId: String(room.id),
          },
          json: {
            message,
          },
        });

        if (!ChatRoomMessageResponse.ok) {
          throw new Error("Error Send item message");
        }

        queryClient.invalidateQueries({ queryKey: ["get_chat_id_by_item"] });

        return toast(`Success!`, {
          description: "Message correctly sent, check your inbox!",
          duration: 5000,
        });
      } catch (error) {
        toast(`Error :(`, {
          description:
            "We are encountering technical problems, please retry later.",
          duration: 4000,
        });
      }
    },
  });

  return {
    messageBoxForm,
    isFavorite: isFavorite === null ? false : isFavorite,
    isFavoriteLoading,
    chatId,
    isChatIdLoading,
    handleFavorite,
    handlePayment,
  };
}
