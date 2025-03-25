"use client";

import { ItemCard } from "@workspace/ui/components/item-card/item-card";
import { useQuery } from "@tanstack/react-query";
import { client } from "#lib/api";
import { toast } from "sonner";

export interface Item {
  id: number;
  title: string;
  price: number;
  image: string;
  created_at: Date;
}

export default function UserItemsComponent() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-items"],
    queryFn: async () => {
      const res = await client.items.user_selling_items.$get();

      if (!res.ok) return [];

      const items = await res.json();

      const reshapedItems = items?.map(({ created_at, ...rest }) => {
        return {
          ...rest,
          created_at: new Date(created_at),
        };
      });

      return reshapedItems;
    },
  });

  const handleDelete = async (id: number) => {
    const deleteResponse = await client.auth.item.user_delete_item[":id"].$post(
      {
        param: {
          id: id.toString(),
        },
      },
    );

    if (!deleteResponse.ok) {
      toast.error(``, {
        description:
          "We are encountering technical problems, please retry later.",
        duration: 4000,
      });
    } else {
      await refetch();

      toast.success(`Success!`, {
        description: `Item deleted correctly!`,
        duration: 4000,
      });
    }
  };

  const handleUnpublish = async (id: number) => {
    const unpublishResponse = await client.auth.item.unpublish_item[
      ":id"
    ].$post({
      param: {
        id: id.toString(),
      },
    });

    if (!unpublishResponse.ok) {
      toast.error(``, {
        description:
          "We are encountering technical problems, please retry later.",
        duration: 4000,
      });
    } else {
      await refetch();

      toast.success(`Success!`, {
        description: `Item ${id} unpublished correctly!`,
        duration: 4000,
      });
    }
  };

  const handleEdit = (id: number) => {
    // Implement edit functionality
    console.log(`Editing item ${id}`);
  };

  const handleShare = (id: number) => {
    console.log(`Sharing item ${id}`);
  };

  return (
    <div className="flex flex-col gap-6 w-full overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Items List</h1>
      </div>

      <div className="flex flex-col gap-6 ">
        {isLoading ? (
          <div className="flex justify-center items-center">Loading..</div>
        ) : data && data?.length > 0 ? (
          data?.map((item, i) => {
            return (
              <ItemCard
                key={i}
                item={item}
                onDelete={() => handleDelete(item.id)}
                onEdit={() => handleEdit(item.id)}
                onUnpubish={() => handleUnpublish(item.id)}
                onShare={() => handleShare(item.id)}
              />
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
