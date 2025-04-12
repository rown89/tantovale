"use client";

import Image from "next/image";
import { ItemDetailCard } from "#components/item-card/index";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ItemWrapperProps {
  item: {
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
}

export default function ItemWDetailrapper({ item }: ItemWrapperProps) {
  const { title, price, description, images, subcategory } = item;

  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUrls = images?.map((file, i) => {
    return (
      <Image
        key={i}
        onClick={() => {
          setFullscreenImage(file);
        }}
        className="object-cover hover:cursor-pointer"
        fill
        src={file}
        alt=""
      />
    );
  });

  return (
    <div className="container mx-auto max-w-[900px] px-4">
      <ItemDetailCard
        isPreview
        imagesRef={fileInputRef}
        item={{ ...item, images: imageUrls }}
      />

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
