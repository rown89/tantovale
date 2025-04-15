import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { formatCurrency } from "@workspace/ui/lib/utils";
import { ChatProps } from ".";

interface ChatHeaderProps {
  id: string;
  room: ChatProps["chatRoom"];
  currentUserId: number;
}

export function ChatHeader({ id, room, currentUserId }: ChatHeaderProps) {
  // Determine if current user is buyer or seller
  const isBuyer = room?.buyer?.id === currentUserId;
  const otherUser = isBuyer ? room.author : room.buyer;

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
          <h2 className="font-medium truncate">{otherUser.username}</h2>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col text-right w-[200px]">
          {room.item.status === "available" && room.item.published ? (
            <>
              <Link
                href={`/item/${room.item.id}`}
                className="font-medium hover:text-accent hover:underline break-all underline"
              >
                {room.item.title}
              </Link>
              <p className="text-sm font-medium">
                {formatCurrency(room.item.price)}€
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
