import { z } from "zod";
import { formOptions } from "@tanstack/react-form";
import {
  createItemSchema,
  multipleImagesSchema,
} from "@workspace/server/schema";

export const placeholderImages = [
  {
    url: "/placeholder.svg",
    alt: "",
  },
];

export const delivery_method_types = [
  { id: "pickup", name: "Pickup" },
  { id: "shipping", name: "Shipping" },
];

export const formOpts = formOptions({
  defaultValues: {
    images: [],
    commons: {
      title: "",
      description: "",
      price: 0,
      delivery_method: "shipping",
      subcategory_id: 0,
    },
    properties: [],
  },
});

export function createDynamicSchema(subCatFilters: any) {
  return createItemSchema
    .and(z.object({ images: multipleImagesSchema }))
    .superRefine((val, ctx) => {
      if (subCatFilters && Array.isArray(subCatFilters)) {
        const requiredFilters =
          subCatFilters?.filter((filter) => filter.on_create_required) || [];

        requiredFilters.forEach((requiredFilter) => {
          // Find the property in the properties array
          const property = val.properties?.find(
            (prop: {
              id: number;
              value: string | number | string[] | number[] | boolean;
              slug: string;
            }) => prop.slug === requiredFilter.slug,
          );

          // Check if property exists and has a valid value
          // For boolean type, false is a valid value
          if (!property) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Property for required filter "${requiredFilter.name}" is missing.`,
              path: ["properties"],
            });
            return;
          }
        });
      }
    });
}
