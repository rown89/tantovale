import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge, Tag, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { client } from "@workspace/server/client-rpc";
import { ItemDetailCard } from "@workspace/ui/components/item-detail-card/index";

export default async function UserDetailPage({
  params,
}: {
  params: { username: string };
}) {
  const { username } = await params;

  const profileDataResponse = await client.profile.compact[":username"].$get({
    param: {
      username,
    },
  });

  if (!profileDataResponse.ok) return notFound();

  const useItemsResponse = await client.items[":username"].$get({
    param: {
      username,
    },
  });

  if (!useItemsResponse.ok) return notFound();

  const profileData = await profileDataResponse.json();
  const items = await useItemsResponse.json();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="grid gap-8">
        {/* User Profile Section */}
        <div className="flex flex-col md:flex-row gap-6 items-center">
          <Avatar className="w-24 h-24">
            <AvatarFallback>
              {username.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{username}</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>
                Member since {format(profileData.created_at, "MMM d, yyyy")}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            return (
              <Link
                href={`/items/${item.id}`}
                key={item.id}
                className="group hover:shadow-md hover:shadow-accent/20 transition-all rounded-xl overflow-hidden"
              >
                <ItemDetailCard
                  item={{
                    id: item.id,
                    title: item.title,
                    price: item.price,
                    images: [
                      <Image
                        key={item.imageUrl}
                        src={item.imageUrl || "/placeholder.svg"}
                        alt={item.title}
                        fill
                        className="object-cover"
                      />,
                    ],
                    category: <div>item.category</div>,
                  }}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
