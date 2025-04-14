"use client";

import { ItemLinearCard } from "@workspace/ui/components/item-linear-card/item-linear-card";
import { useQuery } from "@tanstack/react-query";
import { client } from "@workspace/server/client-rpc";
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
import { ShareSocialModal } from "@workspace/ui/components/social-share-dialog/social-share-dialog";
import { linkBuilder } from "@workspace/shared/utils/linkBuilder";
import { useSellingItems } from "./hooks";
import Link from "next/link";
import Image from "next/image";

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
      const res = await client.items.auth.user_selling_items.$post({
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
    <div className="flex flex-col w-full overflow-auto">
      <div className="flex items-center justify-between sticky top-0 bg-background z-1 px-2 pb-4">
        <h1 className="text-3xl font-bold">Your items</h1>
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

      <div className="flex flex-col gap-6 p-2">
        {isLoading ? (
          <div className="flex flex-col gap-10 opacity-50">
            {[...Array(4).keys()].map((item, i) => (
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
                const link = `/item/${linkBuilder({
                  id: item.id,
                  title: item.title,
                })}`;

                const TitleLink = (
                  <Link
                    className="hover:text-accent inline-grid w-full hover:underline xl:max-w-[80%]"
                    href={`${link}`}
                  >
                    <h3 className="truncate break-all text-lg font-semibold">
                      {item.title}
                    </h3>
                  </Link>
                );

                const ThumbLink = (
                  <Link
                    href={`${link}`}
                    className="relative block h-full min-h-[160px]"
                  >
                    <Image
                      className="h-full object-cover"
                      fill
                      priority
                      src={item.image || "/placeholder.svg"}
                      sizes="(max-width: 720px) 230px, 256px"
                      alt={item.title}
                    />
                  </Link>
                );

                return (
                  <ItemLinearCard
                    key={i}
                    TitleLink={TitleLink}
                    ThumbLink={ThumbLink}
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
