"use client";

import { Heart, BadgeCheck, Mail, Phone, FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, forwardRef } from "react";
import Link from "next/link";

import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@workspace/ui/components/tooltip";

import { useAuth } from "#providers/auth-providers";
import { FieldInfo } from "#components/forms/utils/field-info";
import { ItemWrapperProps } from "../types";
import { PaymentButton } from "./payment-button";
import { ProposalButton } from "./proposal-button";
import { useItemFavorite } from "../hooks/use-item-favorite";
import { useItemPayments } from "../hooks/use-item-payments";
import { useItemChat } from "../hooks/use-item-chat";

interface UserInfoBoxProps {
  item: ItemWrapperProps["item"];
  itemOwnerData: Pick<
    ItemWrapperProps["itemOwnerData"],
    "phone_verified" | "email_verified" | "selling_items"
  >;
  chatId: number | null | undefined;
  isChatIdLoading: boolean;
}

export const UserInfoBox = forwardRef<HTMLDivElement, UserInfoBoxProps>(
  function UserInfoBox({ item, itemOwnerData, chatId, isChatIdLoading }, ref) {
    const item_id = item.id;
    const { phone_verified, email_verified } = itemOwnerData || {};

    const { user } = useAuth();
    const router = useRouter();

    const {
      isBuyModalOpen,
      setIsBuyModalOpen,
      isProposalModalOpen,
      setIsProposalModalOpen,
      handlePayment,
      handleProposal,
    } = useItemPayments({
      item_id,
    });

    const { messageBoxForm } = useItemChat({
      user,
      item_id,
    });

    const { isFavorite, isFavoriteLoading, handleFavorite } = useItemFavorite({
      user,
      item_id,
    });

    const [itemOwnerIsNotCurrentUser, setItemOwnerIsNotCurrentUser] = useState<
      boolean | null
    >(null);

    useEffect(() => {
      setItemOwnerIsNotCurrentUser(item?.user?.id !== user?.id);
    }, [item?.user?.id, user?.id]);

    return (
      <div
        ref={ref}
        className="flex flex-col w-full xl:max-w-[450px] h-auto gap-4"
      >
        <Card className="xl:sticky xl:top-4 w-full">
          {itemOwnerIsNotCurrentUser && (
            <CardHeader>
              <CardTitle
                className={`flex flex-col break-all justify-between items-center gap-3`}
              >
                {item?.is_payable && (
                  <PaymentButton
                    handlePayment={() => {
                      if (user) {
                        handlePayment.mutate(item.price);
                      } else {
                        router.push("/login");
                      }
                    }}
                  />
                )}

                {item?.is_payable && (
                  <ProposalButton
                    handleProposal={() => {
                      if (user) {
                        handlePayment.mutate(item.price);
                      } else {
                        router.push("/login");
                      }
                    }}
                  />
                )}

                <div className="mt-2 w-full flex justify-center">
                  {isFavoriteLoading ? (
                    <Spinner />
                  ) : (
                    <Button
                      className="hover:bg-destructive/70 w-full font-bold"
                      variant={!isFavorite ? "outline" : "destructive"}
                      disabled={isFavoriteLoading}
                      onClick={() => {
                        if (!user) {
                          router.push("/login");
                          return;
                        }

                        if (isFavorite) {
                          handleFavorite.mutate("remove");
                        } else {
                          handleFavorite.mutate("add");
                        }
                      }}
                    >
                      {!isFavorite ? (
                        <Heart className="text-inherit" />
                      ) : (
                        <Heart />
                      )}
                      {!isFavorite ? "Favorite" : "UnFavorite"}
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
          )}

          <CardContent>
            <div className="flex flex-col gap-2">
              <Separator className="mb-4" />

              <Label className="mb-1">Venditore:</Label>
              <div className="flex items-start text-accent w-full justify-between">
                <Link
                  href={`/user/${item?.user?.username || "user"}`}
                  className="hover:underline hover:text-accent item-center flex gap-2"
                >
                  {phone_verified && email_verified && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <BadgeCheck color="green" />
                        </TooltipTrigger>
                        <TooltipContent className="bg-background outline-1 outline-green">
                          <div className="flex flex-col gap-2 text-primary p-2">
                            <span className="flex gap-2 item-center">
                              <Mail size={20} />
                              <p>Email verified</p>
                            </span>
                            <Separator />
                            <span className="flex gap-2 item-center">
                              <Phone size={20} />
                              <p>Phone verified</p>
                            </span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <p className="text-xl">{item?.user?.username || "User"}</p>
                </Link>
              </div>

              <div className="grid grid-cols-2 mb-2">
                <span className="flex gap-2">
                  <FileSpreadsheet /> Annunci online:{" "}
                  {itemOwnerData?.selling_items || 0}
                </span>
              </div>
            </div>
          </CardContent>

          {!isChatIdLoading && itemOwnerIsNotCurrentUser && (
            <CardFooter className="flex flex-col gap-2 items-start">
              <Label className="mb-1">Richiedi informazioni</Label>
              {!chatId ? (
                <form
                  className="w-full"
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (!user) {
                      router.push("/login");
                    } else {
                      messageBoxForm.handleSubmit();
                    }
                  }}
                >
                  <messageBoxForm.Field name="message">
                    {(field) => {
                      const { name, handleBlur, handleChange, state } = field;
                      const { value } = state;

                      return (
                        <div className="flex flex-col w-full gap-4">
                          <Textarea
                            className="bg-background/80"
                            id={name}
                            name={name}
                            rows={6}
                            maxLength={600}
                            value={value !== undefined ? value?.toString() : ""}
                            onBlur={handleBlur}
                            onChange={(e) => handleChange(e.target.value)}
                            placeholder="Scrivi al venditore per avere informazioni...."
                          />

                          <FieldInfo field={field} />
                        </div>
                      );
                    }}
                  </messageBoxForm.Field>

                  <messageBoxForm.Subscribe
                    selector={(formState) => ({
                      canSubmit: formState.canSubmit,
                      isSubmitting: formState.isSubmitting,
                      isDirty: formState.isDirty,
                    })}
                  >
                    {(state) => {
                      const { canSubmit, isSubmitting } = state;
                      return (
                        <div className="flex justify-end mt-4">
                          <Button
                            type="submit"
                            disabled={!canSubmit}
                            className="sticky bottom-0"
                          >
                            {isSubmitting ? "..." : "Invia messaggio"}
                          </Button>
                        </div>
                      );
                    }}
                  </messageBoxForm.Subscribe>
                </form>
              ) : (
                <Button
                  variant="default"
                  className="w-full font-bold"
                  onClick={() => router.push(`/auth/chat/${chatId}`)}
                >
                  Go to Chat
                </Button>
              )}
            </CardFooter>
          )}
        </Card>

        {itemOwnerIsNotCurrentUser && (
          <span className="w-full text-center">
            Annuncio sospetto?{" "}
            <Link
              className="hover:cursor-pointer underline hover:text-accent"
              href={`/item-anomaly/${item_id}`}
            >
              Segnala
            </Link>
          </span>
        )}
      </div>
    );
  },
);
