"use client";

import { useState } from "react";
import { Drama } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";

import { client } from "@workspace/server/client-rpc";
import { ItemLinearCard } from "@workspace/ui/components/item-linear-card/item-linear-card";
import { linkBuilder } from "@workspace/shared/utils/linkBuilder";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { ShareSocialModal } from "@workspace/ui/components/social-share-dialog/social-share-dialog";

export interface Item {
  id: number;
  title: string;
  price: number;
  image: string;
  created_at: Date;
}

export default function ProfileFavorites() {
  const [shareItem, setShareItem] = useState<Item | null>(null);

  const {
    data: favorites,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["get_user_favorites"],
    queryFn: async () => {
      const response = await client.items.auth.user.favorites.$get();

      if (!response.ok) return [];

      const items = await response.json();

      const reshapedItems = items?.map(({ created_at, ...rest }) => {
        return {
          ...rest,
          created_at: new Date(created_at),
        };
      });

      return reshapedItems;
    },
  });

  const handleShare = (item: Item) => {
    setShareItem(item);
  };

  return (
    <div className="container mx-auto py-6 px-6 lg:px-2 xl:px-0 h-[calc(100vh-56px)]">
      <div className="flex gap-6 h-full">
        <div className="space-y-6 w-full">
          <h1 className="text-3xl font-bold tracking-tight">Favorites</h1>
          <p className="text-muted-foreground">Manage your saved items.</p>
          <Separator />

          <div className="flex flex-col gap-4 space-y-6">
            {isLoading ? (
              <Spinner />
            ) : !favorites?.length ? (
              <div className="flex gap-2 w-full justify-center items-center">
                <Drama />
                <p className="text-center py-8 text-muted-foreground">
                  No favorites found
                </p>
              </div>
            ) : (
              favorites?.map((item, i) => {
                const link = `/item/${linkBuilder({
                  id: item.id,
                  title: item.title,
                })}`;

                const TitleLink = (
                  <Link
                    key={item.id}
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
                    key={item.id}
                    href={`${link}`}
                    className="relative block h-full min-h-[160px]"
                  >
                    <Image
                      key={item.id}
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
                    onShare={() => handleShare(item)}
                  />
                );
              })
            )}

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
          </div>
        </div>
      </div>
    </div>
  );
}
