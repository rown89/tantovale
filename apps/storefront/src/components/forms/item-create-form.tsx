"use client";

import { useActionState, useEffect, useState } from "react";
import {
  formOptions,
  mergeForm,
  useField,
  useForm,
  useTransform,
} from "@tanstack/react-form";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { createItemAction } from "#actions/item/create";
import { createItemSchema } from "../../../../server/src/routes/item/types";
import { initialFormState } from "@tanstack/react-form/nextjs";
import { client } from "#lib/api";
import { useQuery } from "@tanstack/react-query";
import { FieldInfo } from "./field-info";
import { useRouter, useSearchParams } from "next/navigation";
import { CategorySelector } from "#components/category-selector/category-selector";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "#workspace/ui/components/select";
import { Spinner } from "#workspace/ui/components/spinner";
import { Switch } from "#workspace/ui/components/switch";
import { Checkbox } from "#workspace/ui/components/checkbox";
import { MultiSelect } from "#workspace/ui/components/multi-select";
import {
  RadioGroup,
  RadioGroupItem,
} from "#workspace/ui/components/radio-group";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

export const formOpts = formOptions({
  defaultValues: {
    commons: {
      title: "",
      description: "",
      condition: "used",
      price: 1,
      shipping_cost: 1,
      delivery_method: "pickup",
      subcategory_id: 1,
    },
    properties: [{ name: "condition", value: "new" }],
  },
});

export default function CreateItemForm({
  subcategory,
}: {
  subcategory?: Omit<Category, "subcategories">;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, action, isPending] = useActionState(
    createItemAction,
    initialFormState,
  );

  const [selectedCategory, setSelectedCategory] = useState<Omit<
    Category,
    "subcategories"
  > | null>(subcategory || null);
  const [nestedSubcategories, setNestedSubcategories] = useState<Category[]>(
    [],
  );

  const form = useForm({
    ...formOpts?.defaultValues,
    validators: {
      onChange: createItemSchema,
    },
    transform: useTransform(
      (baseForm) => mergeForm(baseForm, state ?? {}),
      [state],
    ),
  });

  const title = useField({ form, name: "commons.title" });
  const description = useField({ form, name: "commons.description" });
  const price = useField({ form, name: "commons.price" });
  const subcategory_id = useField({ form, name: "commons.subcategory_id" });

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

      const subcategoryFilters = await res.json();

      return subcategoryFilters;
    },
    enabled: !!subcategory?.id,
  });

  const handleQueryParamChange = (qs: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(qs, value);
    const newUrl = `?${params.toString()}`;

    router.replace(newUrl);
  };

  function getNestedCategories() {
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

      const nestedSubcategories = categoriesWithSubcategories;

      setNestedSubcategories(nestedSubcategories);
    }
  }

  const handleSelect = (category: Omit<Category, "subcategories">) => {
    setSelectedCategory(category);
    handleQueryParamChange("cat", category?.id?.toString());
  };

  useEffect(() => {
    if (subcategory) {
      subcategory_id.setValue(Number(subcategory.id));
      handleSelect(subcategory);
    }
  }, []);

  useEffect(() => {
    if (allCategories?.length && allSubcategories?.length) {
      getNestedCategories();
    }
  }, [allCategories, allSubcategories]);

  return (
    <div className="container mx-auto py-6 px-4 h-[calc(100vh-56px)]">
      <div className="flex gap-6 h-full">
        {/* Left Column - Form */}
        <div className="md:max-w-md w-full break-words">
          <form
            action={action as never}
            onSubmit={() => form.handleSubmit()}
            className="space-y-4 w-full h-full flex flex-col justify-between"
          >
            <div className="overflow-scroll flex gap-4 flex-col">
              <form.Field name="commons.subcategory_id">
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Label className="block">
                        Category <span className="text-red-500">*</span>
                      </Label>
                      <CategorySelector
                        categories={nestedSubcategories}
                        selectedCategoryControlled={selectedCategory}
                        onSelect={(e) => {
                          handleSelect(e);
                          field.setValue(e.id);
                        }}
                      />
                    </div>
                  );
                }}
              </form.Field>

              <form.Field name="commons.title">
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Label htmlFor={field.name} className="block">
                        Title <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value ?? ""}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={
                          field.state.meta.isTouched &&
                          field.state.meta.errors?.length
                            ? "true"
                            : "false"
                        }
                        className={
                          field.state.meta.isTouched &&
                          field.state.meta.errors?.length
                            ? "border-red-500"
                            : ""
                        }
                        placeholder="Enter a title"
                      />
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>

              <form.Field name="commons.price">
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Label htmlFor={field.name} className="block">
                        Price <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0.20"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(e.target.valueAsNumber)
                        }
                        aria-invalid={
                          field.state.meta.isTouched &&
                          field.state.meta.errors?.length
                            ? "true"
                            : "false"
                        }
                        className={
                          field.state.meta.isTouched &&
                          field.state.meta.errors?.length
                            ? "border-red-500"
                            : ""
                        }
                      />
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>

              <form.Field name="commons.description">
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Label htmlFor={field.name} className="block">
                        Description <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id={field.name}
                        name={field.name}
                        rows={4}
                        maxLength={800}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Enter a description for your item"
                        aria-invalid={
                          field.state.meta.isTouched &&
                          field.state.meta.errors?.length
                            ? "true"
                            : "false"
                        }
                        className={
                          field.state.meta.isTouched &&
                          field.state.meta.errors?.length
                            ? "border-red-500 max-h-52"
                            : "max-h-52"
                        }
                      />
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>

              {isLoadingSubCatFilters ? (
                <Spinner />
              ) : (
                subCatFilters &&
                subCatFilters?.length > 0 &&
                subCatFilters?.map((filter) => {
                  return (
                    <form.Field
                      key={filter.id}
                      name={`properties.${filter.name}`}
                    >
                      {(field) => {
                        if (filter.type === "select") {
                          return (
                            <div className="space-y-2">
                              <Label htmlFor={field.name} className="block">
                                {filter.name}{" "}
                                <span className="text-red-500">*</span>
                              </Label>
                              <Select
                                onValueChange={(e) => field.handleChange(e)}
                                defaultValue={field.state.value}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue
                                    placeholder={`Select a ${filter.name}`}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {filter.options?.map((item, i) => (
                                      <SelectItem
                                        key={i}
                                        value={item.id?.toString()}
                                      >
                                        {item.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        }

                        if (filter.type === "select_multi") {
                          return (
                            <div className="space-y-2">
                              <Label htmlFor={field.name} className="block">
                                {filter.name}{" "}
                                <span className="text-red-500">*</span>
                              </Label>
                              <MultiSelect
                                options={filter.options.map(
                                  ({ id, name: label, value }) => ({
                                    id,
                                    label,
                                    value: value?.toString() ?? "",
                                  }),
                                )}
                                onValueChange={field.handleChange}
                                defaultValue={field.state.value}
                                placeholder={`Select ${filter.name}`}
                                variant="inverted"
                                animation={2}
                                maxCount={3}
                              />
                            </div>
                          );
                        }

                        if (filter.type === "boolean") {
                          return (
                            <div className="flex items-center gap-2">
                              <Label htmlFor={field.name}>{filter.name}</Label>
                              <Switch
                                checked={field.state.value}
                                onCheckedChange={(checked) =>
                                  field.handleChange(checked)
                                }
                              />
                            </div>
                          );
                        }

                        if (filter.type === "number") {
                          return (
                            <div className="space-y-2">
                              <Label htmlFor={field.name}>{filter.name}</Label>

                              <Input
                                type="number"
                                id={field.name}
                                value={field.state.value}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                              />
                            </div>
                          );
                        }

                        if (filter.type === "checkbox") {
                          return (
                            <div
                              className={`flex gap-2 ${filter.options.length > 3 ? "flex-col" : "flex-row"}`}
                            >
                              <Label htmlFor={field.name}>{filter.name}</Label>
                              {filter.options.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-2"
                                >
                                  <Checkbox
                                    id={`${field.name}-${item.id}`}
                                    checked={
                                      Array.isArray(field.state.value) &&
                                      field.state.value.includes(item.id)
                                    }
                                    onCheckedChange={(checked) => {
                                      const currentValues = Array.isArray(
                                        field.state.value,
                                      )
                                        ? [...field.state.value]
                                        : [];

                                      if (checked) {
                                        // Add the item.id if it's not already in the array
                                        if (!currentValues.includes(item.id)) {
                                          field.handleChange([
                                            ...currentValues,
                                            item.id,
                                          ]);
                                        }
                                      } else {
                                        // Remove the item.id from the array
                                        field.handleChange(
                                          currentValues.filter(
                                            (id) => id !== item.id,
                                          ),
                                        );
                                      }
                                    }}
                                  />
                                  <Label htmlFor={`${field.name}-${item.id}`}>
                                    {item.name}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        if (filter.type === "radio") {
                          return (
                            <div className={`flex gap-2 flex-col`}>
                              <Label htmlFor={field.name}>{filter.name}</Label>
                              <RadioGroup
                                value={field.state.value?.toString()}
                                onValueChange={(val) => field.handleChange(val)}
                                className={`flex gap-2 ${filter.options.length > 3 ? "flex-col" : "flex-row"}`}
                              >
                                {filter.options.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-center gap-2"
                                  >
                                    <RadioGroupItem
                                      id={`${field.name}-${item.id}`}
                                      value={item.id?.toString()}
                                    />
                                    <Label htmlFor={`${field.name}-${item.id}`}>
                                      {item.name}
                                    </Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </div>
                          );
                        }

                        return null;
                      }}
                    </form.Field>
                  );
                })
              )}

              <p>{JSON.stringify(form.state.errors, null, 2)}</p>
            </div>
            <form.Subscribe
              selector={(formState) => [
                formState.canSubmit,
                formState.isSubmitting,
                formState.isDirty,
              ]}
            >
              {([canSubmit, isSubmitting, isDirty]) => {
                return (
                  <Button
                    type="submit"
                    disabled={
                      !canSubmit ||
                      !isDirty ||
                      isPending ||
                      isLoadingSubCatFilters
                    }
                    className="sticky bottom-0"
                  >
                    {isSubmitting ? "..." : "Submit"}
                  </Button>
                );
              }}
            </form.Subscribe>
          </form>
        </div>

        {/* Right Column - Preview */}
        <div className="md:w-full md:inline-block hidden h-full py-5">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-2xl font-bold break-all">
                  {String(title.state.value ?? "") || "Title of the item"}
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col justify-between relative">
              <div className="flex flex-col">
                <p className="text-xl font-semibold mb-4">
                  € {Number(price.state.value ?? 0).toFixed(2) || "Item Title"}
                </p>
                <div className="text-gray-600 mb-4 whitespace-pre-wrap max-h-60 overflow-auto break-all">
                  {String(description.state.value ?? "") ||
                    "Item description will appear here."}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="bg-gray-100 p-4 rounded-md my-6">
            <p className="text-sm text-gray-500">
              This is a preview of how your item will appear to others.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
