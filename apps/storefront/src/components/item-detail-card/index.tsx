"use client";

import React, { ReactNode } from "react";
import { Card, CardContent } from "@workspace/ui/components/card";
import Slider from "@workspace/ui/components/carousel/slider";
import { Button } from "@workspace/ui/components/button";
import { MapPin, Truck } from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";

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
}

export const ItemDetailCard = React.memo(
  ({
    isPreview = false,
    isCompact = false,
    item,
    imagesRef,
    maxImages,
  }: ItemDetailCardrops) => {
    const { title, price, description, city, images, condition, subcategory } =
      item;

    const formattedPrice = price ? (price / 100).toFixed(2) : "0.00";

    return (
      <div className="w-full overflow-hidden h-full">
        <Card className="border-2 shadow-md transition-all duration-300 hover:shadow-lg">
          <CardContent className="flex flex-col justify-between relative p-6">
            <div className="flex flex-col gap-2">
              <div className="min-h-[450px] w-full bg-background/50 rounded-t-md flex items-center justify-center flex-col mb-3">
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

              <div className="flex gap-5 justify-between items-start">
                <h1 className="text-3xl font-bold break-all">
                  {title || "Your item title..."}
                </h1>
              </div>

              <div className="flex flex-col gap-2 items-start md:items-center md:flex-row md:justify-between">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {city || "Location"}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {item.deliveryMethods?.length ? (
                    item.deliveryMethods.map((method, i) => (
                      <>
                        <Badge
                          key={i}
                          variant="outline"
                          className="font-normal"
                        >
                          <span className="flex items-center gap-1">
                            <Truck className="h-3 w-3" /> {method}
                          </span>
                        </Badge>
                        {item.deliveryMethods &&
                          item.deliveryMethods.length > 1 &&
                          i === 0 &&
                          "/"}
                      </>
                    ))
                  ) : (
                    <Badge variant="outline" className="font-normal">
                      <span className="flex items-center gap-1">
                        Delivery mode
                      </span>
                    </Badge>
                  )}

                  <Badge className="text-lg font-semibold px-3 py-1">
                    €{formattedPrice}
                  </Badge>
                </div>
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
