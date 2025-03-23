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
              value: string | number | string[] | number[];
              slug: string;
            }) => prop.slug === requiredFilter.slug,
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

          // Check if property has a valid value based on filter type
          const value = property.value;
          let isValid = false;

          switch (requiredFilter.type) {
            case "select":
            case "radio":
              // For select and radio, value should be a non-empty string or number
              isValid = value !== undefined && value !== null && value !== "";
              break;
            case "select_multi":
            case "checkbox":
              // For multi-select and checkbox, value should be a non-empty array
              isValid = Array.isArray(value) && value.length > 0;
              break;
            case "boolean":
              // For boolean, value should be a boolean
              isValid = typeof value === "boolean";
              break;
            case "number":
              // For number, value should be a number and not NaN
              isValid = typeof value === "number" && !isNaN(value);
              break;
            default:
              // For any other type, just check if value exists
              isValid = value !== undefined && value !== null && value !== "";
          }

          if (!isValid) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Required filter "${requiredFilter.name}" must have a valid value.`,
              path: ["properties"],
            });
          }
        });
      }
    });
}
