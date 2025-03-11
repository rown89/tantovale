"use server";

import { formOpts } from "#components/forms/item-create-form";
import {
  ServerValidateError,
  createServerValidate,
} from "@tanstack/react-form/nextjs";
import { createItemSchema } from "@workspace/server/schema";

const serverValidate = createServerValidate({
  ...formOpts,
  onServerValidate: ({ value }) => {
    if (!value) return;

    // Normalize and parse properties:
    // If serializedProperties exists and has content, parse it into an array.
    // Otherwise, default to an empty array.
    value.properties = value.serializedProperties?.length
      ? JSON.parse(value.serializedProperties)
      : [];
    delete (value as any).serializedProperties;

    // Normalize commons if it exists.
    if (value.commons) {
      // Ensure subcategory_id is a number.
      if (value.commons.subcategory_id) {
        value.commons.subcategory_id = Number(value.commons.subcategory_id);
      }
      // Normalize price: parse as float then convert dollars to cents.
      if (value.commons.price) {
        const priceInput = parseFloat(value.commons.price.toString());
        value.commons.price = Math.round(priceInput * 100);
      }
    }

    console.log(value);

    // Validate the value against the schema.
    const result = createItemSchema.safeParse(value);
    if (!result.success) {
      // Log and return an array of error messages.
      const errorMessages = result.error.errors.map((err) => err.message);
      errorMessages.forEach((msg) => console.log(msg));
      return errorMessages;
    }
  },
});

export async function createItemAction(prev: unknown, formData: FormData) {
  try {
    await serverValidate(formData);
  } catch (e) {
    if (e instanceof ServerValidateError) {
      //  console.error(e.formState);
      return e.formState;
    }
    throw e;
  }
}
