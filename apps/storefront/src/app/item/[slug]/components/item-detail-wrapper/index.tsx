"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Badge } from "@workspace/ui/components/badge";

import { ItemDetailCard } from "#components/item-detail-card";
import { useItemDetail } from "./hooks/use-item-detail";
import { ItemWrapperProps } from "./types";
import { UserInfoBox } from "./components/right-sidebar";

export default function ItemWDetailrapper({
  item,
  itemOwnerData,
}: ItemWrapperProps) {
  const item_id = item.id;
  const { images } = item;

  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { chatId, isChatIdLoading } = useItemDetail({
    item_id,
  });

  return (
    <div className="container mx-auto px-4 flex flex-col my-4">
      <div className="flex gap-8 xl:gap-12 w-full h-full flex-col xl:flex-row">
        {/* Item Card Detail  */}
        <ItemDetailCard
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

        {/* Right sidebar */}
        <UserInfoBox
          item={item}
          itemOwnerData={itemOwnerData}
          chatId={chatId}
          isChatIdLoading={isChatIdLoading}
        />
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
