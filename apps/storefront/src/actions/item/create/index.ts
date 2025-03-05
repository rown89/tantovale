"use server";

import {
  ServerValidateError,
  createServerValidate,
} from "@tanstack/react-form/nextjs";

import { createItemSchema } from "../../../../../server/src/routes/item/types";

const serverValidate = createServerValidate({
  onServerValidate: ({ value }) => {
    console.log(value);
    const result = createItemSchema.safeParse(value);
    if (!result.success) {
      // Return the validation errors
      return result.error.errors.map((err) => err.message);
    }

    // api network call
  },
});

export async function createItemAction(prevState: unknown, formData: FormData) {
  try {
    await serverValidate(formData);
  } catch (error) {
    if (error instanceof ServerValidateError) {
      return error.formState;
    }

    // Some other error occurred while validating your form
    throw error;
  }
}
