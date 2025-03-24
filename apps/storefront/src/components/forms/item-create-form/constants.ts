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
    serializedProperties: "",
    properties: [],
  },
});

export function createDynamicSchema(subCatFilters: any) {
  // Create a modified schema that allows boolean values in properties
  const modifiedSchema = z.object({
    commons: z.object({
      title: z.string().min(1, "Title is required"),
      description: z.string().min(1, "Description is required"),
      price: z.number().min(1, "Price must be greater than 0"),
      delivery_method: z.string().min(1, "Delivery method is required"),
      subcategory_id: z.number().min(1, "Category is required"),
    }),
    properties: z
      .array(
        z.object({
          id: z.number(),
          slug: z.string(),
          value: z.union([
            z.string(),
            z.number(),
            z.array(z.string()),
            z.array(z.number()),
            z.boolean(), // Add boolean as a valid type
          ]),
        }),
      )
      .default([]), // Add default empty array
    serializedProperties: z.string().optional(),
  });

  return modifiedSchema
    .and(z.object({ images: multipleImagesSchema }))
    .superRefine((val, ctx) => {
      if (subCatFilters && Array.isArray(subCatFilters)) {
        const requiredFilters =
          subCatFilters?.filter((filter) => filter.on_create_required) || [];

        requiredFilters.forEach((requiredFilter) => {
          // Find the property in the properties array
          const property = val.properties?.find(
            (prop) => prop.slug === requiredFilter.slug,
          );

          // Check if property exists
          if (!property) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Property for required filter "${requiredFilter.name}" is missing.`,
              path: ["properties"],
            });
            return;
          }

          // For boolean type, we consider it valid regardless of true/false
          // For other types, check if the value is empty
          if (
            requiredFilter.type !== "boolean" &&
            (property.value === undefined ||
              property.value === null ||
              property.value === "" ||
              (Array.isArray(property.value) && property.value.length === 0))
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Property for required filter "${requiredFilter.name}" cannot be empty.`,
              path: ["properties"],
            });
          }
        });
      }
    });
}
