"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";

import { client } from "@workspace/server/client-rpc";
import { ItemLinearCard } from "@workspace/ui/components/item-linear-card/item-linear-card";
import { linkBuilder } from "@workspace/shared/utils/linkBuilder";
import { useState } from "react";
import { Separator } from "@workspace/ui/components/separator";

export interface Item {
  id: number;
  title: string;
  price: number;
  image: string;
  created_at: Date;
}

export default function ProfileFavorites() {
  const [shareItem, setShareItem] = useState<Item | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["get_user_favorites"],
    queryFn: async () => {
      const response = await client.items.auth.favorites.$get();

      if (!response.ok) return [];

      return await response.json();
    },
  });

  const handleShare = (item: Item) => {
    setShareItem(item);
  };

  return (
    <div className="flex flex-col w-full px-4">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Favorites</h1>
        <p className="text-muted-foreground">Manage your saved items.</p>
        <Separator />

        <div className="flex flex-col gap-4 space-y-6">
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
                onShare={() => handleShare(item)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
