import { z } from "zod";
import { reshapedCreateItemSchema } from "./reshaped-create-item-schema";

export interface PropertyType {
  id: number;
  name: string;
  on_item_create_required: boolean;
  options: {
    id: number;
    name: string;
    value: string | number | boolean | string[] | number[] | boolean[] | null;
  }[];
  slug: string;
  type: string;
}

export type PropertyFormValue = Pick<PropertyType, "id" | "slug" | "name"> & {
  value: PropertyType["options"][number]["value"];
};

export type reshapedSchemaType = z.infer<
  ReturnType<typeof reshapedCreateItemSchema>
>;
