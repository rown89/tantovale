import { z } from "zod";

import {
  createItemSchema,
  multipleImagesSchema,
  propertySchema,
  shippingSchema,
} from "@workspace/server/extended_schemas";

import { PropertyType } from "./types";

export const reshapedCreateItemSchema = ({
  propertiesData,
  isManualShipping,
  isPickup,
}: {
  propertiesData?: PropertyType[];
  isManualShipping?: boolean;
  isPickup?: boolean;
}) => {
  return createItemSchema
    .and(
      z.object({
        images: multipleImagesSchema,
      }),
    )
    .and(
      z
        .object({
          properties: propertySchema,
        })
        // Check if all required subcat properties are satisfied
        .superRefine((val, ctx) => {
          propertiesData?.forEach((property) => {
            if (
              property.on_item_create_required &&
              !val.properties?.find((p) => p.slug === property.slug)?.value
            ) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["properties", property.slug],
              });
            }
          });
        }),
    )
    .and(
      z.object({
        shipping: shippingSchema.superRefine((val, ctx) => {
          if (isManualShipping && !isPickup) {
            if (!val.shipping_price || val.shipping_price <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Shipping price must be greater than 0",
                path: ["shipping_price"],
              });
              return false;
            }
          }
          if (isPickup && !isManualShipping) {
            console.log("val", val);
            if (val.shipping_price && val.shipping_price !== 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Shipping price must be 0 when using pickup",
              });
            }
          }
          if (!isManualShipping && !isPickup) {
            if (!val.item_weight) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["shipping", "item_weight"],
              });
            }
            if (!val.item_length) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["shipping", "item_length"],
              });
            }
            if (!val.item_width) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["shipping", "item_width"],
              });
            }
            if (!val.item_height) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["shipping", "item_height"],
              });
            }
            if (
              !val.item_weight ||
              !val.item_length ||
              !val.item_width ||
              !val.item_height
            ) {
              return false;
            }
          }
          return true;
        }),
      }),
    );
};
