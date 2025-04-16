"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeftRight,
  BadgeCheck,
  FileSpreadsheet,
  Heart,
  Mail,
  Minus,
  Phone,
  ShoppingCart,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@workspace/ui/components/tooltip";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";

import { useAuth } from "#providers/auth-providers";
import { ItemDetailCard } from "#components/item-detail-card";
import { FieldInfo } from "#components/forms/utils/field-info";
import { useItemDetail } from "./hooks/use-item-detail";
import { ItemWrapperProps } from "./types";
import { Spinner } from "@workspace/ui/components/spinner";

export default function ItemWDetailrapper({
  item,
  itemOwnerData,
}: ItemWrapperProps) {
  const { images } = item;

  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const { user } = useAuth();
  const router = useRouter();
  const {
    messageBoxForm,
    isFavorite,
    isFavoriteLoading,
    chatId,
    isChatIdLoading,
    handleFavorite,
  } = useItemDetail({
    item_id: item.id,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const itemOwnerIsNotCurrentUser = item.user.id !== user?.id;

  return (
    <div className="container mx-auto px-4 flex flex-col my-4">
      <div className="flex gap-8 xl:gap-12 w-full h-full flex-col xl:flex-row">
        <ItemDetailCard
          isFavorite={isFavorite}
          imagesRef={fileInputRef}
          item={{
            ...item,
            images: images?.map((url, i) => (
              <Image
                key={i}
                onClick={() => {
                  setFullscreenImage(url);
                }}
                className="object-cover hover:cursor-pointer"
                fill
                src={url}
                alt=""
              />
            )),

            subcategory: item.subcategory && (
              <Link
                href={`/items/condition/${item.subcategory.slug ?? "#"}`}
                target="_blank"
                className="mb-2"
              >
                <Badge variant="outline" className="text-sm bg-accent px-3">
                  {item.subcategory.name}
                </Badge>
              </Link>
            ),
          }}
        />

        <div
          id="user-info-box"
          className="flex flex-col w-full xl:max-w-[450px] h-auto gap-4"
        >
          <Card className="xl:sticky xl:top-4 w-full">
            {itemOwnerIsNotCurrentUser && (
              <CardHeader>
                <CardTitle className="flex flex-col break-all justify-between items-center gap-3">
                  {isFavoriteLoading ? (
                    <Spinner />
                  ) : (
                    <Button
                      className="hover:bg-amber-300"
                      variant={!isFavorite ? "outline" : "destructive"}
                      onClick={() => {
                        if (isFavorite) {
                          handleFavorite.mutate("remove");
                        } else {
                          handleFavorite.mutate("add");
                        }
                      }}
                    >
                      {!isFavorite ? <Heart /> : <Minus />}
                      {!isFavorite ? "Add to Favorites" : "Remove favorite"}
                    </Button>
                  )}

                  {item.is_payable && (
                    <div className="flex flex-col w-full items-center gap-4">
                      <Separator className="my-2" />
                      <Button
                        variant="secondary"
                        className="w-full max-w-[280px] font-bold text-slate-900 shadow-md"
                        onClick={() => {
                          if (!user) {
                            router.push("/login");
                          } else {
                          }
                        }}
                      >
                        <ShoppingCart />
                        <p>Acquista</p>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full max-w-[280px] shadow-accent"
                        onClick={() => {
                          if (!user) {
                            router.push("/login");
                          } else {
                          }
                        }}
                      >
                        <ArrowLeftRight />
                        <p> Fai una proposta</p>
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
            )}

            <CardContent>
              <div className="flex flex-col gap-2">
                <Separator className="mb-4" />

                <Label className="mb-1">Venditore:</Label>
                <div className="outline-1 p-3 rounded-2xl outline-foreground/10 bg-background/90">
                  <div className="flex items-start gap-2 text-accent w-full justify-between">
                    <Link
                      href={`/user/${item.user.username}`}
                      className="hover:underline hover:text-accent item-center flex gap-2"
                    >
                      {itemOwnerData.phone_verified &&
                        itemOwnerData.email_verified && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <BadgeCheck color="green" />
                              </TooltipTrigger>
                              <TooltipContent className="bg-background outline-1 outline-green">
                                <span className="flex flex-col gap-2 text-primary">
                                  <span className="flex gap-2 item-center">
                                    <Mail size={15} />
                                    <p>Email verified</p>
                                  </span>

                                  <span className="flex gap-2 item-center">
                                    <Phone size={15} />
                                    <p>Pone verified</p>
                                  </span>
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}{" "}
                      <p className="text-xl">{item.user.username}</p>
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 mt-4">
                    <span className="flex gap-2">
                      <FileSpreadsheet /> Annunci online:{" "}
                      {itemOwnerData.selling_items}
                    </span>

                    <span className="flex gap-2">
                      <FileSpreadsheet /> Annunci pubblicati:{" "}
                      {itemOwnerData.selling_items}
                    </span>
                  </div>
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
                              value={
                                value !== undefined ? value?.toString() : ""
                              }
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
                href="/item-anomalies"
              >
                Segnala
              </Link>
            </span>
          )}
        </div>
      </div>

      {/* image Fullscreen Preview (doesn't work on initial placeholder images) */}
      <AnimatePresence>
        {fullscreenImage && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFullscreenImage(null)}
          >
            <motion.img
              src={fullscreenImage}
              alt="Fullscreen"
              className="h-full p-12 object-contain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
