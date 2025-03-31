"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import Slider from "@workspace/ui/components/carousel/slider";
import { placeholderImages } from "../utils";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "#workspace/ui/components/button";

interface ItemPreviewProps {
  title: string;
  price: number;
  description: string;
  imagesRef: React.RefObject<HTMLInputElement | null>;
  maxImages: number;
  images: File[];
  subcategory?: string;
}

// Helper function to compare two arrays of images
function areImagesEqual(prevImages: File[], nextImages: File[]): boolean {
  if (prevImages.length !== nextImages.length) return false;

  // Compare each image by name and last modified date
  return prevImages.every((prevImg, index) => {
    const nextImg = nextImages[index];
    return (
      prevImg.name === nextImg?.name &&
      prevImg.lastModified === nextImg.lastModified
    );
  });
}

const ItemPreview = React.memo(
  ({
    title,
    price,
    description,
    imagesRef,
    maxImages,
    images,
    subcategory,
  }: ItemPreviewProps) => {
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

    // Create image URLs for preview - properly formatted for the Slider component
    const imageUrls = useMemo(() => {
      return images.map((file, i) => {
        const imageUrl = URL.createObjectURL(file);
        return (
          <div
            key={i}
            onClick={() => {
              setFullscreenImage(imageUrl);
            }}
          >
            <Image
              fill
              className="object-cover hover:cursor-pointer"
              src={imageUrl}
              alt=""
            />
          </div>
        );
      });
    }, [images]);

    // Cleanup URLs when component unmounts or images change
    useEffect(() => {
      return () => {
        if (images.length > 0) {
          // Only revoke URLs created from actual files, not placeholder images
          images.forEach((file) => {
            URL.revokeObjectURL(URL.createObjectURL(file));
          });
        }
      };
    }, [images]);

    // Close fullscreen image on Escape key
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setFullscreenImage(null);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
      <div className="w-full overflow-hidden h-full py-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
              <h1 className="text-2xl font-bold break-all">
                {title || "Title of the item"}
              </h1>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-between relative">
            <div className="flex flex-col gap-4">
              <p className="text-xl font-semibold ">
                € {price ? (price / 100).toFixed(2) : "0.00"}
              </p>

              <div className="min-h-[450px] w-full bg-background rounded-t-md flex items-center justify-center flex-col">
                {imageUrls && imageUrls.length > 0 ? (
                  <Slider
                    images={imageUrls}
                    thumbnails={
                      images && Array.isArray(images)
                        ? images.map((file: File, i) => {
                            const thumbUrl = URL.createObjectURL(file);
                            return (
                              <Image
                                key={i}
                                fill
                                className="object-cover hover:cursor-pointer object-center"
                                src={thumbUrl}
                                alt=""
                              />
                            );
                          })
                        : placeholderImages.map((item, i) => (
                            <Image
                              key={i}
                              fill
                              priority
                              className="object-cover"
                              src={item.url}
                              alt={item.alt}
                            />
                          ))
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => imagesRef.current?.click()}>
                      Upload
                    </Button>
                    <p className="text-muted-foreground">
                      Upload up to {maxImages} images
                    </p>
                  </div>
                )}

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

              {/* Subcategory Badge */}
              {subcategory && (
                <div className="mb-2">
                  <Badge variant="outline" className="text-sm">
                    {subcategory}
                  </Badge>
                </div>
              )}

              <div className="whitespace-pre-wrap max-h-60 dark:text-slate-400 text-slate-600 overflow-auto break-all">
                {description || "Your item description will appear here..."}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if any of these props have changed
    return (
      prevProps.title === nextProps.title &&
      prevProps.price === nextProps.price &&
      prevProps.description === nextProps.description &&
      prevProps.subcategory === nextProps.subcategory &&
      areImagesEqual(prevProps.images, nextProps.images)
    );
  },
);

// Add display name for debugging
ItemPreview.displayName = "ItemPreview";

export default ItemPreview;
