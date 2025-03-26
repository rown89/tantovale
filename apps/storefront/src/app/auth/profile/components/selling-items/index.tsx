"use client";

import { ItemCard } from "@workspace/ui/components/item-card/item-card";
import { useQuery } from "@tanstack/react-query";
import { client } from "#lib/api";
import { toast } from "sonner";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectGroup,
  SelectItem,
} from "@workspace/ui/components/select";
import { useState } from "react";
import { ShareSocialModal } from "#workspace/ui/components/social-share-dialog/social-share-dialog";

export interface Item {
  id: number;
  title: string;
  price: number;
  image: string;
  created_at: Date;
}

export default function UserSellingItemsComponent() {
  const [filters, setFilters] = useState<{ publishedType: string }>({
    publishedType: "published",
  });
  const [shareItem, setShareItem] = useState<Item | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-selling-items", filters],
    queryFn: async () => {
      const res = await client.items.user_selling_items.$post({
        json: {
          published: filters.publishedType === "published" ? true : false,
        },
      });

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

  const handleShare = (item: Item) => {
    setShareItem(item);
  };

  return (
    <div className="flex flex-col gap-6 w-full overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Your items {isLoading ? "" : `(${data?.length})`}
        </h1>
        {!isLoading && (
          <Select
            defaultValue={filters.publishedType}
            onValueChange={(e) => {
              setFilters({
                ...filters,
                publishedType: e,
              });
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={"published"}>Published</SelectItem>
                <SelectItem value={"unpublished"}>UnPublished</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-6 ">
        {isLoading ? (
          <div className="flex flex-col gap-10">
            {[...Array(3).keys()].map((item, i) => (
              <div key={i} className="flex space-x-4 w-full">
                <Skeleton className="h-[125px] w-[250px] rounded-xl bg-foreground" />
                <div className="flex flex-col gap-3 space-y-2 w-full">
                  <div className="flex gap-3 w-full">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[200px] bg-foreground" />
                  </div>
                  <div className="flex flex-col gap-2 justify-between h-full">
                    <Skeleton className="h-4 w-full bg-foreground" />
                    <Skeleton className="h-4 w-full bg-foreground" />
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-[80px] bg-foreground" />
                      <Skeleton className="h-4 w-[100px] bg-foreground" />
                    </div>
                  </div>
                </div>
              </div>
            ))}{" "}
          </div>
        ) : data && data?.length > 0 ? (
          <>
            <div className="grid gap-4">
              {data?.map((item, i) => {
                return (
                  <ItemCard
                    key={i}
                    item={item}
                    onDelete={() => handleDelete(item.id)}
                    onEdit={() => handleEdit(item.id)}
                    onUnpubish={() => handleUnpublish(item.id)}
                    onShare={() => handleShare(item)}
                  />
                );
              })}
            </div>

            {shareItem && (
              <ShareSocialModal
                isOpen={!!shareItem}
                onClose={() => setShareItem(null)}
                item={{
                  id: shareItem.id?.toString(),
                  title: shareItem.title,
                }}
              />
            )}
          </>
        ) : (
          <p className="text-center py-8 text-muted-foreground">
            No items found
          </p>
        )}
      </div>
    </div>
  );
}
