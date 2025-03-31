"use client";

import { ItemCard } from "@workspace/ui/components/item-card/item-card";
import { useQuery } from "@tanstack/react-query";
import { client } from "@workspace/shared/clients/rpc-client";
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
import { useSellingItems } from "./hooks";

export interface Item {
  id: number;
  title: string;
  price: number;
  image: string;
  created_at: Date;
}

export default function UserSellingItemsComponent() {
  const [filters, setFilters] = useState<{
    publishedType: "published" | "unpublished";
  }>({
    publishedType: "published",
  });

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

  const { shareItem, setShareItem, handleDelete, handleEdit, handlePublish } =
    useSellingItems(refetch);

  const handleDeleteWithToast = async (id: number) => {
    const success = await handleDelete(id);
    if (success) {
      toast.success(`Success!`, {
        description: `Item deleted correctly!`,
        duration: 4000,
      });
    } else {
      toast.error(``, {
        description:
          "We are encountering technical problems, please retry later.",
        duration: 4000,
      });
    }
  };

  const handlePublishWithToast = async (id: number, published: boolean) => {
    const success = await handlePublish(id, published);
    if (success) {
      toast.success(`Success!`, {
        description: `Item ${id} ${published ? "published" : "unpublished"} correctly!`,
        duration: 4000,
      });
    } else {
      toast.error(``, {
        description:
          "We are encountering technical problems, please retry later.",
        duration: 4000,
      });
    }
  };

  const handleShare = (item: Item) => {
    setShareItem(item);
  };

  return (
    <div className="flex flex-col gap-6 w-full overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your items</h1>
        {!isLoading && (
          <Select
            defaultValue={filters.publishedType}
            onValueChange={(e: "published" | "unpublished") => {
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
                <SelectItem value={"published"}>
                  Published{" "}
                  {isLoading
                    ? ""
                    : filters.publishedType === "published" &&
                      `(${data?.length})`}
                </SelectItem>
                <SelectItem value={"unpublished"}>
                  UnPublished{" "}
                  {isLoading
                    ? ""
                    : filters.publishedType === "unpublished" &&
                      `(${data?.length})`}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-6 ">
        {isLoading ? (
          <div className="flex flex-col gap-10 opacity-50">
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
            <div className="grid gap-6 xl:gap-4">
              {data?.map((item, i) => {
                return (
                  <ItemCard
                    key={i}
                    item={item}
                    onDelete={() => handleDeleteWithToast(item.id)}
                    onEdit={() => handleEdit(item.id)}
                    onPublish={() => handlePublishWithToast(item.id, true)}
                    onUnpubish={() => handlePublishWithToast(item.id, false)}
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
        ) : isError ? (
          <p>Something went wrong.</p>
        ) : (
          <p className="text-center py-8 text-muted-foreground">
            No items found
          </p>
        )}
      </div>
    </div>
  );
}
