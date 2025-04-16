"use client";

import React, { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import Slider from "@workspace/ui/components/carousel/slider";
import { Button } from "@workspace/ui/components/button";
import { Heart, MapPin } from "lucide-react";

export interface ItemDetailCardrops {
  isPreview?: boolean;
  isCompact?: boolean;
  imagesRef: React.RefObject<HTMLInputElement | null>;
  maxImages?: number;
  item: {
    id?: number;
    title: string;
    price: number;
    description: string;
    city: string;
    images: ReactNode[];
    subcategory?: ReactNode;
    condition?: ReactNode;
    deliveryMethods?: string[];
  };
  isFavorite?: boolean;
  handleFavorite?: (id: number) => void;
}

export const ItemDetailCard = React.memo(
  ({
    isPreview = false,
    isCompact = false,
    item,
    imagesRef,
    maxImages,
    isFavorite,
    handleFavorite,
  }: ItemDetailCardrops) => {
    const { title, price, description, city, images, condition, subcategory } =
      item;

    return (
      <div className="w-full overflow-hidden h-full">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-col gap-1">
              <div className="flex gap-5 justify-between items-start">
                <h1 className="text-3xl font-bold break-all">
                  {title || "Your item title..."}
                </h1>

                {isCompact && (
                  <Heart
                    className={`${isFavorite ? "text-secondary" : ""}`}
                    onClick={async () => {
                      if (!isPreview && item?.id && handleFavorite) {
                        handleFavorite(item?.id);
                      }
                    }}
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 items-start md:items-center md:flex-row md:justify-between">
                {city && (
                  <p className="w-full text-accent flex gap-1 items-center text">
                    <MapPin size={15} />
                    {city}
                  </p>
                )}
                <p className="text-xl font-semibold text-end w-full text-balance">
                  € {price ? (price / 100).toFixed(2) : "0.00"}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-between relative">
            <div className="flex flex-col gap-4">
              <div className="min-h-[450px] w-full bg-background/50 rounded-t-md flex items-center justify-center flex-col">
                {images && images.length ? (
                  <Slider images={images} />
                ) : isPreview ? (
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => imagesRef.current?.click()}>
                      Upload
                    </Button>
                    <p className="text-muted-foreground">
                      Upload up to {maxImages} images
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-between gap-2">
                <div className="flex gap-2">
                  {/* Subcategory Badge */}
                  {subcategory && subcategory}
                  {/* Condition */}
                  {condition && condition}
                </div>
              </div>
              {!isCompact && (
                <div
                  className={`text-[17px] whitespace-pre-wrap ${isPreview ? "max-h-80" : ""} dark:text-slate-400 text-slate-600 overflow-auto break-all`}
                >
                  {description || "Your item description will appear here..."}
                </div>
              )}
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
