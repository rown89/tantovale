import Link from "next/link";
import { formatDistanceToNow, addDays } from "date-fns";
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
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@workspace/ui/components/dialog";

export function ChatMessage({ message, item, isChatOwner }: ChatMessageProps) {
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
        isChatOwner ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          "flex flex-col max-w-[80%]",
          isChatOwner ? "items-end" : "items-start",
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
                        (proposalStatus === "rejected" ||
                          proposalStatus === "expired") &&
                          "bg-destructive/10",
                        proposalStatus === "accepted" && "bg-green-500/10",
                        proposalStatus === "pending" && "bg-background",
                      )}
                    >
                      <CardHeader>
                        <CardTitle>
                          😃 &nbsp;
                          {isChatOwner ? "Your " : "You have a buy "}
                          proposal
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="my-2 italic">"{message.message}</p>
                        <div className="flex">
                          {isChatOwner ? (
                            <span className="flex gap-1">
                              You are offering{" "}
                              <p className="font-bold">
                                {formatPrice(orderProposal.proposal_price)}€
                              </p>
                            </span>
                          ) : (
                            <span className="flex gap-1">
                              <Link
                                className="text-accent hover:underline"
                                href={`/user/${message.sender.username}`}
                              >
                                {message.sender.username}
                              </Link>{" "}
                              is offering you{" "}
                              <p className="font-bold">
                                {formatPrice(orderProposal.proposal_price)}€
                              </p>
                            </span>
                          )}
                        </div>
                        <p className="italic mt-2 text-muted-foreground">
                          * This proposal will expire automatically in{" "}
                          {formatDistanceToNow(
                            addDays(new Date(orderProposal.created_at), 7),
                          )}
                        </p>
                      </CardContent>
                      <CardFooter
                        className={cn(
                          "flex gap-2",
                          proposalStatus === "pending" && !isChatOwner
                            ? "justify-between"
                            : "justify-center",
                        )}
                      >
                        {/* Buyer actions (when not chat owner and proposal is pending) */}
                        {!isChatOwner && proposalStatus === "pending" && (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  className="flex-1 bg-destructive hover:bg-destructive/70 font-bold"
                                >
                                  Reject
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Reject Proposal</DialogTitle>
                                </DialogHeader>
                                <DialogDescription>
                                  Are you sure you want to reject this proposal?
                                </DialogDescription>
                                <DialogFooter>
                                  <Button
                                    variant="destructive"
                                    onClick={handleRejectProposal}
                                  >
                                    Reject
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="default"
                                  className="flex-1 bg-green-700 hover:bg-green-600 font-bold"
                                >
                                  Accept
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Accept Proposal</DialogTitle>
                                </DialogHeader>
                                <DialogDescription>
                                  Are you sure you want to accept this proposal?
                                </DialogDescription>
                                <DialogFooter>
                                  <Button
                                    variant="default"
                                    className="bg-green-700 hover:bg-green-600 font-bold"
                                    onClick={handleAcceptProposal}
                                  >
                                    Accept
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </>
                        )}

                        {/* Proposal status */}
                        <div className="flex flex-col gap-2 w-full">
                          {/* Buyer view of status (when not pending) */}
                          {!isChatOwner && proposalStatus !== "pending" && (
                            <span className="flex">
                              Proposal status:&nbsp;&nbsp;
                              <p
                                className={cn(
                                  "font-bold",
                                  proposalStatus === "rejected" ||
                                    proposalStatus === "expired"
                                    ? "text-destructive"
                                    : "text-green-500",
                                )}
                              >
                                {proposalStatus}
                              </p>
                            </span>
                          )}

                          {/* Seller view of status (always shown) */}
                          {isChatOwner && (
                            <div className="flex gap-2">
                              <p className="text-foreground">
                                Proposal status:
                              </p>
                              <p
                                className={cn(
                                  "font-bold",
                                  proposalStatus === "rejected" ||
                                    proposalStatus === "expired"
                                    ? "text-destructive"
                                    : "text-green-500",
                                )}
                              >
                                {proposalStatus}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardFooter>
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
                isChatOwner
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
