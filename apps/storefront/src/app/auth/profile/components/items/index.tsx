"use client";

import { useState } from "react";
import { Input } from "@workspace/ui/components/input";
import { ItemCard } from "@workspace/ui/components/item-card/item-card";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { client } from "#lib/api";

export interface Item {
  id: number;
  title: string;
  price: number;
  image: string;
  created_at: Date;
}

export default function UserItemsComponent() {
  const [items, setItems] = useState<Item[]>([]);

  const handleDelete = (id: number) => {
    setItems(items?.filter((item) => item.id !== id));
  };

  const handleEdit = (id: number) => {
    // Implement edit functionality
    console.log(`Editing item ${id}`);
  };

  const handleShare = (id: number) => {
    // Implement share functionality
    console.log(`Sharing item ${id}`);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["item-profiles"],
    queryFn: async () => {
      const res = await client.auth.profile.items.$get();

      if (!res.ok) return [];

      const items = await res.json();

      const reshapedItems = items?.map((item, i) => {
        return {
          ...item,
          created_at: new Date(item.created_at),
        };
      });

      setItems(reshapedItems);
    },
  });

  return (
    <div className="flex flex-col gap-6 w-full overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Items List</h1>
      </div>

      <div className="flex flex-col gap-6 ">
        {items && items?.length > 0 ? (
          items?.map((item, i) => {
            return (
              <div key={i}>
                <ItemCard
                  item={item}
                  onDelete={() => handleDelete(item.id)}
                  onEdit={() => handleEdit(item.id)}
                  onShare={() => handleShare(item.id)}
                />
              </div>
            );
          })
        ) : (
          <p className="text-center py-8 text-muted-foreground">
            No items found
          </p>
        )}
      </div>
    </div>
  );
}
