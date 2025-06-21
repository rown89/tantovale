import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { formatPrice } from "@workspace/ui/lib/utils";
import { ChatProps } from "..";
import { linkBuilder } from "@workspace/shared/utils/linkBuilder";

interface ChatHeaderProps {
  id: string;
  room: ChatProps["chatRoom"];
  currentUserId: number;
}

export function ChatHeader({ id, room, currentUserId }: ChatHeaderProps) {
  // Determine if current user is buyer or seller
  const isBuyer = room?.buyer?.id === currentUserId;
  const otherUser = isBuyer ? room.author : room.buyer;

  const itemSlug = linkBuilder({
    title: room.item.title,
    id: room.item.id,
  });

  return (
    <div
      id={id}
      className="flex items-center justify-between border-b py-4 px-4 gap-2"
    >
      <div className="flex items-center gap-3 w-full">
        <Button variant="ghost" size="icon" asChild className="xl:hidden">
          <Link href="/auth/chat">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back to messages</span>
          </Link>
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarFallback>
            {otherUser.username.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="font-medium truncate">
            <Link
              className="hover:underline"
              href={`/user/${otherUser.username}`}
            >
              {otherUser.username}
            </Link>
          </h2>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col text-right xl:min-w-[200px]">
          {room.item.status === "available" && room.item.published ? (
            <>
              <Link
                href={`/item/${itemSlug}`}
                className="font-medium hover:text-accent hover:underline break-all underline"
              >
                {room.item.title}
              </Link>
              <p className="text-sm font-medium">
                {formatPrice(room.item.price)}€
              </p>
            </>
          ) : (
            <p>Annuncio non disponibile</p>
          )}
        </div>
      </div>
    </div>
  );
}
