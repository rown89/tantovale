import { z } from "zod";

import {
  createItemSchema,
  multipleImagesSchema,
  propertySchema,
  shippingSchema,
} from "@workspace/server/extended_schemas";

import { PropertyType } from "./types";
import useTantovaleStore from "#/stores";

export const reshapedCreateItemSchema = ({
  propertiesData,
}: {
  propertiesData?: PropertyType[];
}) => {
  return createItemSchema
    .extend({
      images: multipleImagesSchema,
      properties: propertySchema,
      shipping: shippingSchema.superRefine((val, ctx) => {
        // Get latest values from store
        const currentStore = useTantovaleStore.getState();
        const { isManualShipping, isPickup } = currentStore;

        // if properties data doesnt not contain delivery_method property or it's not easy_pay, skip this check
        if (
          !propertiesData?.find(
            (property) =>
              property.slug === "delivery_method" ||
              property.slug === "easy_pay",
          )
        ) {
          return true;
        } else {
          if (
            isManualShipping &&
            !isPickup &&
            (!val.manual_shipping_price || val.manual_shipping_price <= 0)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Shipping price must be greater than 0",
              path: ["manual_shipping_price"],
            });
            return false;
          }

          if (
            isPickup &&
            !isManualShipping &&
            (val.manual_shipping_price || val.manual_shipping_price !== 0)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Shipping price must be 0 when using pickup",
            });
          }

          if (!isManualShipping && !isPickup) {
            if (!val.item_weight) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["item_weight"],
              });
            }
            if (!val.item_length) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["item_length"],
              });
            }
            if (!val.item_width) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["item_width"],
              });
            }
            if (!val.item_height) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["item_height"],
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
        }
      }),
    })
    .superRefine((val, ctx) => {
      // Check if all required subcat properties are satisfied
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
    });
};
