import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn, formatPrice } from "@workspace/ui/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";

import { ChatMessageProps } from "./types";
import { useChatMessageHook } from "./use-chat-message";
import { Separator } from "@workspace/ui/components/separator";

export function ChatMessage({
  message,
  item,
  isCurrentUser,
}: ChatMessageProps) {
  const {
    orderProposal,
    isOrderProposalLoading,
    orderProposalError,
    updateProposal,
  } = useChatMessageHook(message);

  const handleAcceptProposal = () => {
    if (!message.order_proposal_id) return;

    updateProposal.mutate({
      orderProposalId: message.order_proposal_id,
      item_id: item.id,
      status: "accepted",
    });
  };

  const handleRejectProposal = () => {
    if (!message.order_proposal_id) return;

    updateProposal.mutate({
      orderProposalId: message.order_proposal_id,
      item_id: item.id,
      status: "rejected",
    });
  };

  const isProposalMessage =
    message.order_proposal_id && message.message_type === "proposal";
  const proposalStatus = orderProposal?.status;

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
          {isProposalMessage ? (
            <>
              {isOrderProposalLoading ? (
                <Spinner />
              ) : (
                orderProposal &&
                !orderProposalError && (
                  <div className="flex flex-col gap-2">
                    <Card
                      className={cn(
                        "min-w-[300px]",
                        proposalStatus === "rejected" && "bg-destructive/10",
                        proposalStatus === "accepted" && "bg-green-500/10",
                        proposalStatus === "pending" && "bg-background",
                      )}
                    >
                      <CardHeader>
                        <CardTitle>
                          😃 {!isCurrentUser ? "You have  a" : "Your"} buy
                          proposal {!isCurrentUser && "from "}
                          {!isCurrentUser && (
                            <Link
                              className="text-accent"
                              href={`/user/${message.sender.username}`}
                            >
                              {message.sender.username}
                            </Link>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-1">
                          <p>{message.sender.username} is offering you</p>
                          <p className="font-bold">
                            {formatPrice(orderProposal.price)}€
                          </p>
                        </div>
                        <Separator className="my-2" />
                        <p className="text-sm ">{message.message}</p>
                      </CardContent>
                      {!isCurrentUser && (
                        <CardFooter
                          className={cn(
                            "flex gap-2",
                            proposalStatus === "pending"
                              ? "justify-between"
                              : "justify-center",
                          )}
                        >
                          {proposalStatus === "pending" ? (
                            <>
                              <Button
                                variant="destructive"
                                className="flex-1"
                                onClick={handleRejectProposal}
                              >
                                Reject
                              </Button>
                              <Button
                                variant="default"
                                className="flex-1"
                                onClick={handleAcceptProposal}
                              >
                                Accept
                              </Button>
                            </>
                          ) : (
                            <p
                              className={cn(
                                "text-center",
                                proposalStatus === "rejected"
                                  ? "text-destructive"
                                  : "text-green-500",
                              )}
                            >
                              {proposalStatus}
                            </p>
                          )}
                        </CardFooter>
                      )}
                    </Card>
                  </div>
                )
              )}
            </>
          ) : (
            // Text message
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
