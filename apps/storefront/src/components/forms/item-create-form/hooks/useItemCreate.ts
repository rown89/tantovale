import { useState } from "react";
import { AnyFieldApi, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { client } from "#lib/api";
import { createDynamicSchema, formOpts } from "../constants";
import { z } from "zod";
import { toast } from "sonner";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

export function useItemCreate(subcategory?: Omit<Category, "subcategories">) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedSubCategory, setSelectedSubCategory] = useState<Omit<
    Category,
    "subcategories"
  > | null>(subcategory || null);
  const [nestedSubcategories, setNestedSubcategories] = useState<Category[]>(
    [],
  );
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Fetch categories
  const {
    data: allCategories,
    isLoading: isLoadingCat,
    isError: isErrorCat,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await client.categories.$get();
      if (!res.ok) return [];
      return await res.json();
    },
  });

  // Fetch subcategories
  const {
    data: allSubcategories,
    isLoading: isLoadingSubCat,
    isError: isErrorSubCat,
  } = useQuery({
    queryKey: ["subcategories"],
    queryFn: async () => {
      const res = await client.subcategories.$get();
      if (!res.ok) return [];
      return await res.json();
    },
  });

  // Fetch subcategory filters
  const {
    data: subCatFilters,
    isLoading: isLoadingSubCatFilters,
    isError: isErrorSubCatFilters,
  } = useQuery({
    queryKey: ["filters_by_subcategories_filters", subcategory?.id],
    queryFn: async () => {
      if (!subcategory?.id) return [];

      const res = await client.filters.subcategory_filters[":id"].$get({
        param: {
          id: String(subcategory?.id),
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch subcategories filters");
        return [];
      }

      return await res.json();
    },
    enabled: !!subcategory?.id,
  });

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

      const { images, ...rest } = value as schemaType;

      try {
        const itemResponse = await client.item.new.$post({
          json: rest,
        });

        if (itemResponse.status !== 201) {
          throw new Error("Failed to add new item");
        }

        const newItem = await itemResponse.json();

        if (images.length > 0) {
          const imagesResponse = await client.auth.uploads["images-item"].$post(
            {
              form: {
                images,
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

  function buildNestedSubCatHierarchy() {
    // Convert subcategories array into a nested structure
    const subcategoryMap = new Map<number, any>();

    // Initialize subcategories map
    allSubcategories?.forEach((sub) => {
      subcategoryMap.set(sub.id, { ...sub, subcategories: [] });
    });

    // Build the hierarchy by linking parent subcategories
    allSubcategories?.forEach((sub) => {
      if (sub.parent_id) {
        const parent = subcategoryMap.get(sub.parent_id);
        if (parent) {
          parent.subcategories.push(subcategoryMap.get(sub.id));
        }
      }
    });

    if (allCategories?.length && allSubcategories?.length) {
      // Attach subcategories to categories
      const categoriesWithSubcategories = allCategories?.map((category) => ({
        ...category,
        subcategories: allSubcategories
          ?.filter((sub) => sub.category_id === category.id && !sub.parent_id)
          .map((sub) => subcategoryMap.get(sub.id)),
      }));

      setNestedSubcategories(categoriesWithSubcategories);
    }
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
    nestedSubcategories,
    fullscreenImage,
    setFullscreenImage,
    isLoadingCat,
    isLoadingSubCat,
    isLoadingSubCatFilters,
    subCatFilters,
    allCategories,
    allSubcategories,
    handleSubCategorySelect,
    buildNestedSubCatHierarchy,
    updatePropertiesArray,
    getCurrentValue,
  };
}
