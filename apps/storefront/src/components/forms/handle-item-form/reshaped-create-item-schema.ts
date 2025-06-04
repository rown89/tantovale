import { z } from "zod";

import {
  createItemSchema,
  multipleImagesSchema,
  propertySchema,
} from "@workspace/server/extended_schemas";

import { PropertyType } from "./types";

export const reshapedCreateItemSchema = ({
  propertiesData,
  isManualShipping,
}: {
  propertiesData?: PropertyType[];
  isManualShipping?: boolean;
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
        shipping_price: z.number().refine(
          (val) => {
            // if isSubcategoryPayable is false, then shipping_price must be 0 or undefined
            if (isManualShipping) {
              return val > 0;
            } else {
              return val === 0 || val === undefined;
            }
          },
          {
            message: "Shipping price must be greater than 0",
          },
        ),
      }),
    );
};
