import { formOptions } from "@tanstack/react-form";
import {
  createItemSchema,
  multipleImagesSchema,
} from "@workspace/server/schema";
import { z } from "zod";

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

export function createDynamicSchema(subCatFilters: any[] | undefined) {
  return createItemSchema
    .and(z.object({ images: multipleImagesSchema }))
    .superRefine((val, ctx) => {
      const requiredFilters =
        subCatFilters?.filter((filter) => filter.on_create_required) || [];

      requiredFilters.forEach((requiredFilter) => {
        const propertyExists = val.properties?.some(
          (prop: {
            id: number;
            value: string | number | string[] | number[];
            slug: string;
          }) => prop.slug === requiredFilter.slug,
        );

        if (!propertyExists) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Property for required filter "${requiredFilter.name}" is missing.`,
            path: ["properties"],
          });
        }
      });
    });
}
