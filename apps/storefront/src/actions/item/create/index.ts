"use server";

import { createItemTypes } from "../../../../../server/src/routes";
import { createItemSchema } from "../../../../../server/src/routes/item/types";
import type { ItemActionResponse } from "./types";

export async function createItemAction(
  prevState: ItemActionResponse | null,
  formData: FormData,
): Promise<ItemActionResponse> {
  // TODO: edit
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    const rawData: createItemTypes = {
      commons: {
        title: formData.get("title") as string,
        description: formData.get("description") as string,
        price: formData.get("price") as string,
        subcategory_id: 2,
      },
      properties: [
        {
          name: "condition",
          value: "new",
        },
      ],
    };

    const validationResult = createItemSchema.safeParse(rawData);

    if (!validationResult.success) {
      const errors: { [key: string]: string[] } = {};

      validationResult.error.issues.forEach((issue) => {
        const path = issue.path[0] as string;
        if (!errors[path]) {
          errors[path] = [];
        }
        errors[path]?.push(issue.message);
      });

      return {
        success: false,
        message: "Validation failed. Please check the form for errors.",
        inputs: rawData,
        errors,
      };
    }

    const articleData = validationResult.data;

    if (Math.random() < 0.1) {
      throw new Error("Server error occurred while processing your request");
    }

    return {
      success: true,
      message: "Article created successfully!",
      inputs: articleData,
    };
  } catch (error) {
    console.error("Error creating article:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
