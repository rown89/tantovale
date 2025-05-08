import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { client } from "@workspace/server/client-rpc";

interface useItemFavoriteProps {
  item_id: number;
  isFavorite: boolean;
}

export function useItemFavorite({ item_id, isFavorite }: useItemFavoriteProps) {
  const [isFavoriteClient, setIsFavoriteClient] = useState<boolean>(isFavorite);

  // Add item to favorites
  const handleFavorite = useMutation({
    mutationFn: async (action: "add" | "remove") => {
      const response = await client.favorites.auth.handle.$post({
        json: { item_id, action },
      });

      if (!response.ok) return false;

      return await response.json();
    },

    onError: (error) => {
      console.error("Failed to send message:", error);
    },

    onSuccess: (value) => {
      setIsFavoriteClient(value as boolean);
    },
  });

  return {
    handleFavorite,
    isFavoriteClient,
  };
}
