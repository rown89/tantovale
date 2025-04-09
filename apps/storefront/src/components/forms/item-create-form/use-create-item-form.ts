import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useRouter, useSearchParams } from "next/navigation";
import { FilterType, formOpts } from "./utils";
import { z } from "zod";
import { toast } from "sonner";
import { client } from "@workspace/shared/clients/rpc-client";
import imageCompression from "browser-image-compression";
import {
  createItemSchema,
  multipleImagesSchema,
} from "@workspace/server/extended_schemas";
import { handleQueryParamChange } from "#utils/handle-qp";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

export interface UseItemFormProps {
  subcategory?: Omit<Category, "subcategories">;
  subCatFilters: FilterType[] | undefined;
}

const schema = createItemSchema.and(z.object({ images: multipleImagesSchema }));
type schemaType = z.infer<typeof schema>;

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

  // Initialize form
  const form = useForm({
    ...formOpts.defaultValues,
    validators: {
      onSubmitAsync: schema.superRefine(async (val, ctx) => {
        if (
          subCatFilters &&
          Array.isArray(subCatFilters) &&
          subCatFilters?.length > 0
        ) {
          const requiredFilters = subCatFilters.filter(
            (filter) => filter.on_item_create_required,
          );

          // Check each required filter
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
      }),
    },
    onSubmit: async ({ value }: { value: schemaType }) => {
      setIsSubmittingForm(true);

      try {
        const { images, ...rest } = value;

        const itemResponse = await client.item.auth.new.$post({
          json: rest,
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

          const imagesResponse = await client.uploads.auth["images-item"].$post(
            {
              form: {
                images: compressedImages,
                item_id: String(newItem.item_id),
              },
            },
          );

          if (!imagesResponse.ok) {
            throw new Error("Failed to upload images");
          }
        }

        toast(`Success!`, {
          description: "Item added correctly!",
          duration: 4000,
        });

        router.push("/");
      } catch (error) {
        toast(`Error :(`, {
          description:
            "We are encountering technical problems, please retry later.",
          duration: 4000,
        });
      } finally {
        setIsSubmittingForm(false);
      }
    },
  });

  function handlePropertiesReset() {
    form.setFieldValue("properties", []);
  }

  function handleSubCategorySelect(
    subcategory: Omit<Category, "subcategories">,
  ) {
    setSelectedSubCategory(subcategory);
    const field = form.getFieldValue("commons.subcategory_id");

    if (field && typeof field === "object" && "setValue" in field) {
      (field as { setValue: (value: number) => void }).setValue(subcategory.id);
    }

    handleQueryParamChange(
      "cat",
      subcategory?.id?.toString(),
      searchParams,
      router,
    );
  }

  return {
    form,
    isSubmittingForm,
    selectedSubCategory,
    isCityPopoverOpen,
    setIsCityPopoverOpen,
    handleSubCategorySelect,
    handlePropertiesReset,
  };
}
