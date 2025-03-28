import { useState } from "react";
import { AnyFieldApi, useForm } from "@tanstack/react-form";
import { useRouter, useSearchParams } from "next/navigation";
import { formOpts } from "../constants";
import { z } from "zod";
import { toast } from "sonner";
import { client } from "#lib/api";
import imageCompression from "browser-image-compression";
import {
  createItemSchema,
  multipleImagesSchema,
} from "@workspace/server/schema";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

interface UseItemFormProps {
  subcategory?: Omit<Category, "subcategories">;
  subCatFilters:
    | {
        id: number;
        name: string;
        on_item_create_required: boolean;
        options: {
          id: number;
          name: string;
          value: any;
        }[];
        slug: string;
        type: string;
      }[]
    | undefined;
}

export function useCreateItemForm({
  subcategory,
  subCatFilters,
}: UseItemFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedSubCategory, setSelectedSubCategory] = useState<Omit<
    Category,
    "subcategories"
  > | null>(subcategory || null);
  const [isCityPopoverOpen, setIsCityPopoverOpen] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Create schema with validation
  const schema = createItemSchema
    .and(z.object({ images: multipleImagesSchema }))
    .superRefine((val, ctx) => {
      if (subCatFilters && Array.isArray(subCatFilters)) {
        const requiredFilters =
          subCatFilters.filter((filter) => filter.on_item_create_required) ||
          [];

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
      }
    });

  type schemaType = z.infer<typeof schema>;

  // Function to submit the item data
  async function submitItemData(
    formData: Omit<schemaType, "images">,
    images: File[],
  ) {
    try {
      const itemResponse = await client.auth.item.new.$post({
        json: formData,
      });

      if (itemResponse.status !== 201) {
        throw new Error("Failed to add new item");
      }

      const newItem = await itemResponse.json();

      // Compress images before uploading
      if (images.length > 0) {
        const compressionOptions = {
          maxSizeMB: 2, // Max file size in MB
          maxWidthOrHeight: 2000, // Maintain reasonable dimensions
          useWebWorker: true, // Use web workers for better performance
          preserveExif: true, // Preserve image metadata
        };

        const compressedImages = await Promise.all(
          images.map(async (image) => {
            try {
              return await imageCompression(image, compressionOptions);
            } catch (error) {
              console.error("Error compressing image:", error);
              return image; // Fall back to original if compression fails
            }
          }),
        );

        const imagesResponse = await client.auth.uploads["images-item"].$post({
          form: {
            images: compressedImages,
            item_id: String(newItem.item_id),
          },
        });

        if (!imagesResponse.ok) {
          throw new Error("Failed to upload images");
        }
      }

      return { success: true, item: newItem };
    } catch (error) {
      console.error(error);
      return { success: false, error };
    }
  }

  // Initialize form
  const form = useForm({
    ...formOpts.defaultValues,
    validators: {
      onSubmit: schema,
    },
    onSubmit: async ({ value }: { value: schemaType }) => {
      setIsSubmittingForm(true);

      try {
        const { images, ...rest } = value;
        const result = await submitItemData(rest, images);

        if (result.success) {
          toast(`Success!`, {
            description: "Item added correctly!",
            duration: 4000,
          });
        } else {
          toast(`Error :(`, {
            description:
              "We are encountering technical problems, please retry later.",
            duration: 4000,
          });
        }
      } catch (error) {
        console.error(error);
        toast(`Error :(`, {
          description:
            "We are encountering technical problems, please retry later.",
          duration: 4000,
        });
      } finally {
        setIsSubmittingForm(false);
        router.push("/");
      }
    },
  });

  // Helper functions
  function handleQueryParamChange(qs: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(qs, value);
    const newUrl = `?${params.toString()}`;
    router.replace(newUrl);
  }

  function handleSubCategorySelect(
    subcategory: Omit<Category, "subcategories">,
  ) {
    setSelectedSubCategory(subcategory);
    const field = form.getFieldValue("commons.subcategory_id");

    if (field && typeof field === "object" && "setValue" in field) {
      (field as { setValue: (value: number) => void }).setValue(subcategory.id);
    }
    handleQueryParamChange("cat", subcategory?.id?.toString());
  }

  // Update the properties array with proper types utility
  function updatePropertiesArray({
    value,
    filter,
    field,
  }: {
    value: string | number | boolean | (string | number)[];
    filter: NonNullable<typeof subCatFilters>[number];
    field: AnyFieldApi;
  }) {
    // Ensure we have an array from the field state.
    const currentProperties: { id: number; slug: string; value: any }[] =
      Array.isArray(field.state.value) ? [...field.state.value] : [];

    // Create the new property object.
    const newProperty = {
      id: filter.id,
      slug: filter.slug,
      value,
    };

    // Find if the property already exists.
    // Convert both IDs to strings for comparison to avoid type mismatches
    const existingIndex = currentProperties.findIndex(
      (prop) => String(prop.id) === String(filter.id),
    );

    if (existingIndex !== -1) {
      // Update the existing property.
      currentProperties[existingIndex] = newProperty;
    } else {
      // Add a new property.
      currentProperties.push(newProperty);
    }

    // Update the form field state.
    field.handleChange(currentProperties);
  }

  // set field default values utility
  function getCurrentValue(field: AnyFieldApi, filterId: string | number) {
    if (!Array.isArray(field.state.value)) return undefined;

    // Convert both IDs to strings for comparison
    const prop = field.state.value.find(
      (p) => String(p.id) === String(filterId),
    );
    return prop ? prop.value : undefined;
  }

  return {
    form,
    isSubmittingForm,
    selectedSubCategory,
    isCityPopoverOpen,
    setIsCityPopoverOpen,
    handleSubCategorySelect,
    updatePropertiesArray,
    getCurrentValue,
  };
}
