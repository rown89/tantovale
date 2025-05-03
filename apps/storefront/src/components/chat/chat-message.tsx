import { formatDistanceToNow } from "date-fns";
import { cn, formatPrice } from "@workspace/ui/lib/utils";
import { ChatMessageType } from "@workspace/server/enumerated_values";
import { client } from "@workspace/server/client-rpc";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { ChatItem } from "./index";
import Link from "next/link";
interface ChatMessageProps {
  message: {
    id: number;
    message: string;
    message_type: ChatMessageType;
    order_proposal_id: number | null;
    created_at: string;
    read_at: string | null;
    sender: {
      id: number;
      username: string;
    };
  };
  item: ChatItem;
  isCurrentUser: boolean;
}

export function ChatMessage({
  message,
  item,
  isCurrentUser,
}: ChatMessageProps) {
  const {
    data: orderProposal,
    isLoading: isOrderProposalLoading,
    error: orderProposalError,
  } = useQuery({
    queryKey: ["orderProposal", message.order_proposal_id],
    queryFn: async () => {
      if (
        !message.order_proposal_id ||
        !item.published ||
        item.status !== "available"
      )
        return null;

      const response = await client.orders_proposals.auth.$post({
        json: { id: message.order_proposal_id },
      });

      if (!response.ok) throw new Error("Failed to fetch order proposal");

      return response.json();
    },
  });

  return (
    <div
      className={cn(
        "flex items-start gap-2 mb-4 break-all",
        isCurrentUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          "flex flex-col max-w-[80%]",
          isCurrentUser ? "items-end" : "items-start",
        )}
      >
        <div>
          {message.order_proposal_id && message.message_type === "proposal" ? (
            <>
              {isOrderProposalLoading ? (
                <>loading...</>
              ) : (
                !orderProposalError &&
                orderProposal && (
                  <Card className="min-w-[300px]">
                    <CardHeader>
                      <CardTitle>
                        😃 You have a proposal from{" "}
                        <Link
                          className="text-accent"
                          href={`/user/${message.sender.username}`}
                        >
                          {message.sender.username}
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-1">
                        <p>{message.sender.username} is offering you</p>
                        <p className="font-bold">
                          {formatPrice(orderProposal.price)}€
                        </p>
                      </div>
                    </CardContent>
                    <CardFooter className="flex gap-2 justify-between">
                      <Button variant="destructive" className="flex-1">
                        Reject
                      </Button>
                      <Button variant="default" className="flex-1">
                        Accept
                      </Button>
                    </CardFooter>
                  </Card>
                )
              )}
            </>
          ) : (
            <div
              className={cn(
                "px-3 py-2 rounded-lg",
                isCurrentUser
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/80",
              )}
            >
              <p className="text-sm">{message.message}</p>
            </div>
          )}
        </div>
        <div className="flex items-center mt-1 text-xs text-muted-foreground">
          <span>
            {formatDistanceToNow(new Date(message.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
