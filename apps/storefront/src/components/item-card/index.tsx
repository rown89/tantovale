"use client";

import React, { ReactNode } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import Slider from "@workspace/ui/components/carousel/slider";
import { placeholderImages } from "../../utils/placeholder-images";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

export interface ItemDetailCardrops {
  isPreview: boolean;
  imagesRef: React.RefObject<HTMLInputElement | null>;
  maxImages?: number;
  item: {
    title: string;
    price: number;
    description: string;
    images: ReactNode[];
    imagesThumbs?: ReactNode[];
    subcategory?: {
      name: string;
      slug?: string;
    };
  };
}

export const ItemDetailCard = React.memo(
  ({ isPreview = false, item, imagesRef, maxImages }: ItemDetailCardrops) => {
    const { title, price, description, images, imagesThumbs, subcategory } =
      item;

    return (
      <div className="w-full overflow-hidden h-full py-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
              <h1 className="text-2xl font-bold break-all">
                {title || "Your item title..."}
              </h1>
              <p className="text-xl font-semibold text-end">
                € {price ? (price / 100).toFixed(2) : "0.00"}
              </p>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-between relative">
            <div className="flex flex-col gap-4">
              <div className="min-h-[450px] w-full bg-background rounded-t-md flex items-center justify-center flex-col">
                {isPreview ? (
                  images && images.length > 0 ? (
                    <Slider
                      images={
                        images?.length
                          ? images
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
                      thumbnails={
                        imagesThumbs?.length
                          ? imagesThumbs
                          : images?.length
                            ? images
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
                  )
                ) : null}
              </div>

              {/* Subcategory Badge */}
              {subcategory?.name && (
                <div className="mb-2">
                  {subcategory.slug ? (
                    <Link href={subcategory.slug} target="_blank">
                      <Badge
                        variant="outline"
                        className="text-sm bg-accent px-3"
                      >
                        {subcategory.name}
                      </Badge>
                    </Link>
                  ) : (
                    <Badge variant="outline" className="text-sm bg-accent px-3">
                      {subcategory.name}
                    </Badge>
                  )}
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
    return prevProps.item === nextProps.item;
  },
);

// Add display name for debugging
ItemDetailCard.displayName = "ItemDetailCard";
