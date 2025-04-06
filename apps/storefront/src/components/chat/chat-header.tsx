import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { formatCurrency } from "@workspace/ui/lib/utils";
import { ChatProps } from ".";

interface ChatHeaderProps {
  chatRoom: ChatProps["chatRoom"];
  currentUserId: number;
}

export function ChatHeader({ chatRoom, currentUserId }: ChatHeaderProps) {
  const isBuyer = chatRoom.buyer.id === currentUserId;
  const otherUser = isBuyer ? chatRoom.author : chatRoom.buyer;

  return (
    <div className="flex items-center justify-between border-b py-4 gap-2">
      <div className="flex items-center gap-3 w-full">
        <Button variant="ghost" size="icon" asChild className="md:hidden">
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
          <h2 className="font-medium">{otherUser.username}</h2>
          <p className="text-sm text-muted-foreground">
            {isBuyer ? "Seller" : "Buyer"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-medium">{chatRoom.item.title}</p>
          <p className="text-sm font-medium">
            {formatCurrency(chatRoom.item.price)}
          </p>
        </div>
        <Button variant="outline" size="icon" asChild>
          <Link href={`/items/${chatRoom.item.id}`}>
            <ExternalLink className="h-4 w-4" />
            <span className="sr-only">View item</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
