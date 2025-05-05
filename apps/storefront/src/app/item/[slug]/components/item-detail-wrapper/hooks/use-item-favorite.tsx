import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { client } from "@workspace/server/client-rpc";
import { User } from "#providers/auth-providers";

interface useItemFavoriteProps {
  user: User | null;
  item_id: number;
}

export function useItemFavorite({ user, item_id }: useItemFavoriteProps) {
  const [isFavorite, setIsFavorite] = useState<boolean | null>(null);

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

  return {
    isFavorite: isFavorite === null ? false : isFavorite,
    isFavoriteLoading,
    handleFavorite,
  };
}
