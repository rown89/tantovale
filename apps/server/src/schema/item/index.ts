import { items } from "#database/schema/items";
import { createInsertSchema } from "drizzle-zod";
import { number, string, z } from "zod";

export const propertySchema = z.object({
  id: number(),
  slug: string(),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
});

const imageFileSchema = z
  .instanceof(File)
  .refine((file) => file.type.startsWith("image/"), {
    message: "Only image files are allowed",
  });

const multipleImagesSchema = z
  .array(imageFileSchema)
  .nonempty({ message: "At least one image is required" })
  .max(6, { message: "You can upload up to 6 images at once" });

export const createItemSchema = z.object({
  images: multipleImagesSchema.optional(),
  commons: createInsertSchema(items, {
    title: (schema) =>
      schema.min(5, "Title must be at least 5 characters").max(180),
    description: (schema) =>
      schema.min(100, "Description must be at least 100 characters").max(800),
    price: number().min(0.01, "Price must be greater than 0"),
    delivery_method: z.enum(["shipping", "pickup"], {
      errorMap: () => ({
        message: "Delivery method must be 'shipping' or 'pickup'.",
      }),
    }),
  }).omit({
    user_id: true,
    published: true,
    status: true,
    shipping_cost: true,
    created_at: true,
    updated_at: true,
  }),
  properties: z
    .preprocess(
      (val) => (Array.isArray(val) ? val : []),
      z.array(propertySchema).optional().default([]),
    )
    .superRefine((val, ctx) => {
      if (val.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one property is required.",
          path: ["properties"],
        });
      }
    })
    .optional(),
});
