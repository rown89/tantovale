"use client";

import Image from "next/image";
import { ItemDetailCard } from "#components/item-detail-card";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";
import { Badge } from "@workspace/ui/components/badge";

interface ItemWrapperProps {
  item: {
    id: number;
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
  const { images } = item;

  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
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

  async function handleFavorite(id: number) {
    setIsFavorite(true);
  }

  return (
    <div className="container mx-auto px-4 flex gap-12 flex-col">
      <div className="flex gap-12 w-full h-full">
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
          className="flex flex-col max-w-[400px] w-full h-auto gap-12"
        >
          <Card>
            <CardHeader>
              <CardTitle>User:</CardTitle>
            </CardHeader>
            <CardContent></CardContent>
            <CardFooter></CardFooter>
          </Card>

          <div className="flex flex-col gap-3">
            <Button>Acquista</Button>

            <Button>Fai una proposta</Button>

            <Button className="mt-4">Contatta</Button>
          </div>
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
