import { useState } from "react";
import { AnyFieldApi, useForm } from "@tanstack/react-form";
import { useRouter, useSearchParams } from "next/navigation";
import { createDynamicSchema, formOpts } from "../constants";
import { z } from "zod";
import { toast } from "sonner";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

interface UseItemFormProps {
  subcategory?: Omit<Category, "subcategories">;
  subCatFilters: any[] | undefined;
  submitItemData: (
    formData: any,
    images: File[],
  ) => Promise<{ success: boolean; item?: any; error?: any }>;
}

export function useItemForm({
  subcategory,
  subCatFilters,
  submitItemData,
}: UseItemFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedSubCategory, setSelectedSubCategory] = useState<Omit<
    Category,
    "subcategories"
  > | null>(subcategory || null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Create schema with validation
  const schema = createDynamicSchema(subCatFilters);
  type schemaType = z.infer<typeof schema>;

  // Initialize form
  const form = useForm({
    ...formOpts.defaultValues,
    validators: {
      onSubmit: schema,
    },
    onSubmit: async ({ value }) => {
      setIsSubmittingForm(true);

      try {
        const { images, ...rest } = value as schemaType;
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
    const existingIndex = currentProperties.findIndex(
      (prop) => prop.id === filter.id,
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
    const prop = field.state.value.find((p) => p.id === filterId.toString());
    return prop ? prop.value : undefined;
  }

  return {
    form,
    isSubmittingForm,
    selectedSubCategory,
    fullscreenImage,
    setFullscreenImage,
    handleSubCategorySelect,
    updatePropertiesArray,
    getCurrentValue,
  };
}
