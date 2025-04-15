"use client";

import Link from "next/link";
import Image from "next/image";
import { useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BadgeCheck, FileSpreadsheet, Mail, Phone } from "lucide-react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { ItemDetailCard } from "#components/item-detail-card";
import { Separator } from "@workspace/ui/components/separator";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@workspace/ui/components/tooltip";
import { Textarea } from "@workspace/ui/components/textarea";

import { ChatMessageSchema } from "@workspace/server/extended_schemas";
import { FieldInfo } from "#components/forms/utils/field-info";
import { Label } from "@workspace/ui/components/label";
import { useAuth } from "#providers/auth-providers";
import { useRouter } from "next/navigation";

interface ItemWrapperProps {
  item: {
    id: number;
    username: string;
    title: string;
    description: string;
    price: number;
    city: string;
    images: string[];
    subcategory: {
      name: string;
      slug: string;
    };
  };
  ownerData: {
    id: number;
    phone_verified: boolean;
    email_verified: boolean;
    selling_items: number;
    city: {
      id: number;
      name: string;
    };
  };
}

export default function ItemWDetailrapper({
  item,
  ownerData,
}: ItemWrapperProps) {
  const { images } = item;

  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  const router = useRouter();
  const { user, loadingUser, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageBoxForm = useForm({
    defaultValues: {
      message: "",
    },
    validators: {
      onSubmit: ChatMessageSchema,
    },
  });

  const imageUrls = images?.map((url, i) => {
    return (
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
    );
  });

  async function handleFavorite(id: number) {
    setIsFavorite(true);
  }

  return (
    <div className="container mx-auto px-4 flex flex-col my-4">
      <div className="flex gap-4 xl:gap-12 w-full h-full flex-col xl:flex-row">
        <ItemDetailCard
          isPreview={false}
          isFavorite={isFavorite}
          imagesRef={fileInputRef}
          item={{
            ...item,
            images: imageUrls,

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
          handleFavorite={handleFavorite}
        />

        <div
          id="user-info-box"
          className="flex flex-col w-full xl:max-w-[450px] h-auto gap-4"
        >
          <Card className="xl:sticky xl:top-4 w-full">
            <CardHeader>
              <CardTitle className="flex flex-col break-all justify-between items-center gap-3">
                <Button
                  variant="secondary"
                  className="w-full font-bold text-slate-900 shadow-md"
                  onClick={() => {
                    if (!user) {
                      router.push("/login");
                    }
                  }}
                >
                  Acquista
                </Button>
                <Button
                  variant="outline"
                  className="w-full shadow-accent"
                  onClick={() => {
                    if (!user) {
                      router.push("/login");
                    }
                  }}
                >
                  Fai una proposta
                </Button>
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex flex-col gap-2">
                <Separator className="mb-4" />

                <Label>Venditore:</Label>
                <div className="outline-1 p-3 rounded-2xl outline-foreground/10 bg-background/90">
                  <div className="flex items-start gap-2 text-accent w-full justify-between">
                    <Link
                      href={`/user/${item.username}`}
                      className="hover:underline hover:text-accent item-center flex gap-2"
                    >
                      {ownerData.phone_verified && ownerData.email_verified && (
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
                      {item.username}
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 mt-4">
                    <span className="flex gap-2">
                      <FileSpreadsheet /> Annunci online:{" "}
                      {ownerData.selling_items}
                    </span>

                    <span className="flex gap-2">
                      <FileSpreadsheet /> Annunci pubblicati:{" "}
                      {ownerData.selling_items}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-2 items-start">
              <Label>Richiedi informazioni</Label>
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
            </CardFooter>
          </Card>

          <span className="w-full text-center">
            Annuncio sospetto?{" "}
            <Link
              className="hover:cursor-pointer underline hover:text-accent"
              href="/item-anomalies"
            >
              Segnala
            </Link>
          </span>
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
