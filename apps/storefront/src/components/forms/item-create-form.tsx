"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import {
  AnyFieldApi,
  formOptions,
  useField,
  useForm,
} from "@tanstack/react-form";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { client } from "#lib/api";
import { FieldInfo } from "./utils/field-info";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { CategorySelector } from "#components/category-selector";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@workspace/ui/components/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Spinner } from "@workspace/ui/components/spinner";
import { Switch } from "@workspace/ui/components/switch";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { MultiSelect } from "@workspace/ui/components/multi-select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group";
import {
  createItemSchema,
  multipleImagesSchema,
} from "@workspace/server/schema";
import Slider from "@workspace/ui/components/carousel/slider";
import MultiImageUpload from "@workspace/ui/components/image-uploader/multi-image-uploader";
import { compressImages } from "#utils/imageCompression";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

const placeholderImages = [
  {
    url: "/placeholder.svg",
    alt: "",
  },
];

export const formOpts = formOptions({
  defaultValues: {
    images: [],
    commons: {
      title: "",
      description: "",
      price: 0,
      delivery_method: "shipping",
      subcategory_id: 0,
    },
    serializedProperties: "",
    properties: [],
  },
});

export default function CreateItemForm({
  subcategory,
}: {
  subcategory?: Omit<Category, "subcategories">;
}) {
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

  const schema = createItemSchema
    .and(z.object({ images: multipleImagesSchema }))
    .superRefine((val, ctx) => {
      const requiredFilters =
        subCatFilters?.filter((filter) => filter.on_create_required) || [];

      // For each required filter, check if there's a corresponding property in the schema
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
    });

  type schemaType = z.infer<typeof schema>;

  const form = useForm({
    ...formOpts.defaultValues,
    validators: {
      onChange: schema,
    },
    onSubmit: async ({ value }) => {
      const { images, ...rest } = value as schemaType;

      try {
        const itemResponse = await client.item.new.$post({
          json: rest,
        });

        if (!itemResponse?.ok) {
          // error modal
        } else {
          // ok modal
        }
      } catch (error) {
        console.log(error);
      }
    },
  });
  const title = useField({ form, name: "commons.title" });
  const price = useField({ form, name: "commons.price" });
  const description = useField({ form, name: "commons.description" });
  const subcategory_id = useField({ form, name: "commons.subcategory_id" });
  const properties = useField({ form, name: "properties" });
  const images = useField({ form, name: "images" });

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

      const nestedSubcategories = categoriesWithSubcategories;

      setNestedSubcategories(nestedSubcategories);
    }
  }

  function handleSubCategorySelect(
    subcategory: Omit<Category, "subcategories">,
  ) {
    setSelectedSubCategory(subcategory);
    subcategory_id.setValue(subcategory.id);
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

  // on mount
  useEffect(() => {
    // if we have a subcategory already settled in the query params:
    if (subcategory) handleSubCategorySelect(subcategory);
  }, []);

  useEffect(() => {}, [subcategory]);

  useEffect(() => {
    // build category (subcategory) menu hierarchy:
    if (allCategories?.length && allSubcategories?.length) {
      buildNestedSubCatHierarchy();
    }
  }, [allCategories, allSubcategories]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const delivery_method_types = [
    {
      id: "pickup",
      name: "Pickup",
    },
    { id: "shipping", name: "Shipping" },
  ];

  return (
    <div className="container mx-auto py-6 px-4 h-[calc(100vh-56px)]">
      <div className="flex gap-6 h-full">
        {/* Left Column - Form */}
        <div className="w-full md:max-w-[400px] h-full break-words">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-4 w-full h-full flex flex-col justify-between"
          >
            <div className="overflow-auto flex gap-4 flex-col">
              {/* <p className="py-4 text-sm">
                {JSON.stringify(form.state.errors, null, 4)}
              </p> */}

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
                        value={field.state.value?.toString()}
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
                        value={((field.state.value as number) / 100).toString()}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          field.handleChange(
                            Math.round(e.target.valueAsNumber * 100),
                          );
                        }}
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

              <form.Field name="images">
                {(field) => {
                  return (
                    <div className="space-y-2 ">
                      <MultiImageUpload
                        maxImages={5}
                        onImagesChange={(images: any) => {
                          field.handleChange(images);
                        }}
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
                        value={field.state.value?.toString()}
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

              <form.Field name="commons.delivery_method">
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Label htmlFor={field.name} className="block">
                        Delivery method <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        name={field.name}
                        onValueChange={(
                          value: schemaType["commons"]["delivery_method"],
                        ) => field.handleChange(value)}
                        defaultValue={field.state.value?.toString()}
                        aria-invalid={
                          field.state.meta.isTouched &&
                          field.state.meta.errors?.length
                            ? "true"
                            : "false"
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={`Select a Delivery method`}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {delivery_method_types?.map((item, i) => (
                              <SelectItem key={i} value={item.id?.toString()}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>

              <form.Field
                name="commons.subcategory_id"
                defaultValue={selectedSubCategory?.id}
              >
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Label className="block">
                        Category <span className="text-red-500">*</span>
                      </Label>
                      <CategorySelector
                        categories={nestedSubcategories}
                        selectedCategoryControlled={
                          selectedSubCategory || subcategory
                        }
                        onSelect={(e) => {
                          form.reset({ properties: [] });
                          handleSubCategorySelect(e);
                          field.setValue(e.id);
                        }}
                      />
                    </div>
                  );
                }}
              </form.Field>

              {isLoadingCat || isLoadingSubCat || isLoadingSubCatFilters ? (
                <Spinner />
              ) : (
                subCatFilters &&
                subCatFilters?.length > 0 &&
                subCatFilters?.map((filter) => {
                  return (
                    <form.Field key={filter.id} name={`properties`}>
                      {(field) => {
                        return (
                          <div className="space-y-2">
                            {/* select */}
                            {filter.type === "select" && (
                              <>
                                <Label htmlFor={field.name} className="block">
                                  {filter.name}{" "}
                                  {filter.on_create_required && (
                                    <span className="text-red-500">*</span>
                                  )}
                                </Label>
                                <Select
                                  name={field.name}
                                  onValueChange={(value) => {
                                    updatePropertiesArray({
                                      // If "reset" is selected, clear the selection
                                      value: value === "reset" ? [] : value,
                                      filter,
                                      field,
                                    });
                                  }}
                                  defaultValue={getCurrentValue(
                                    field,
                                    filter.id,
                                  )}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue
                                      placeholder={`Select a ${filter.name}`}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {!filter.on_create_required && (
                                        <SelectItem value="reset">
                                          --
                                        </SelectItem>
                                      )}
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

                                {field.state.meta.errors.some((item: any) =>
                                  item?.message?.includes(filter.name),
                                ) ? (
                                  <FieldInfo field={field} />
                                ) : null}
                              </>
                            )}
                            {/* select_multi */}
                            {filter.type === "select_multi" && (
                              <>
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
                                  onValueChange={(value) =>
                                    updatePropertiesArray({
                                      value,
                                      filter,
                                      field,
                                    })
                                  }
                                  defaultValue={getCurrentValue(
                                    field,
                                    filter.id,
                                  )}
                                  placeholder={`Select ${filter.name}`}
                                  variant="inverted"
                                  animation={2}
                                  maxCount={3}
                                />
                                <FieldInfo field={field} />
                              </>
                            )}
                            {/* boolean */}
                            {filter.type === "boolean" && (
                              <>
                                <Label htmlFor={field.name}>
                                  {filter.name}
                                </Label>
                                <Switch
                                  checked={
                                    getCurrentValue(field, filter.id) || false
                                  }
                                  onCheckedChange={(checked) =>
                                    updatePropertiesArray({
                                      value: checked,
                                      filter,
                                      field,
                                    })
                                  }
                                />
                                <FieldInfo field={field} />
                              </>
                            )}
                            {/* number */}
                            {filter.type === "number" && (
                              <>
                                <Label htmlFor={field.name}>
                                  {filter.name}
                                </Label>
                                <Input
                                  type="number"
                                  id={field.name}
                                  value={
                                    getCurrentValue(field, filter.id) || ""
                                  }
                                  onChange={(e) => {
                                    // Convert string to number for number inputs
                                    const numValue =
                                      e.target.value === ""
                                        ? ""
                                        : Number(e.target.value);
                                    updatePropertiesArray({
                                      value: numValue,
                                      filter,
                                      field,
                                    });
                                  }}
                                />
                                <FieldInfo field={field} />
                              </>
                            )}
                            {/* checkbox */}
                            {filter.type === "checkbox" && (
                              <div
                                className={`flex gap-2 ${filter.options.length > 3 ? "flex-col" : "flex-row"}`}
                              >
                                <Label htmlFor={field.name}>
                                  {filter.name}
                                </Label>
                                {filter.options.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={`${field.name}-${item.id}`}
                                      checked={
                                        Array.isArray(
                                          getCurrentValue(field, filter.slug),
                                        ) &&
                                        getCurrentValue(
                                          field,
                                          filter.id,
                                        ).includes(item.id)
                                      }
                                      onCheckedChange={(checked) => {
                                        const currentValues = Array.isArray(
                                          getCurrentValue(field, filter.id),
                                        )
                                          ? [
                                              ...getCurrentValue(
                                                field,
                                                filter.id,
                                              ),
                                            ]
                                          : [];

                                        if (checked) {
                                          // Add the item.id if it's not already in the array
                                          if (
                                            !currentValues.includes(item.id)
                                          ) {
                                            updatePropertiesArray({
                                              value: [
                                                ...currentValues,
                                                item.id,
                                              ],
                                              filter,
                                              field,
                                            });
                                          }
                                        } else {
                                          // Remove the item.id from the array
                                          updatePropertiesArray({
                                            value: currentValues.filter(
                                              (id) => id !== item.id,
                                            ),
                                            filter,
                                            field,
                                          });
                                        }
                                      }}
                                    />
                                    <Label htmlFor={`${field.name}-${item.id}`}>
                                      {item.name}
                                    </Label>
                                  </div>
                                ))}
                                <FieldInfo field={field} />
                              </div>
                            )}
                            {/* radio */}
                            {filter.type === "radio" && (
                              <>
                                <Label htmlFor={field.name}>
                                  {filter.name}
                                </Label>
                                <RadioGroup
                                  value={(
                                    getCurrentValue(field, filter.id) || ""
                                  ).toString()}
                                  onValueChange={(val) =>
                                    updatePropertiesArray({
                                      value: val,
                                      filter,
                                      field,
                                    })
                                  }
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
                                      <Label
                                        htmlFor={`${field.name}-${item.id}`}
                                      >
                                        {item.name}
                                      </Label>
                                    </div>
                                  ))}
                                </RadioGroup>
                                <FieldInfo field={field} />
                              </>
                            )}
                          </div>
                        );
                      }}
                    </form.Field>
                  );
                })
              )}
            </div>
            <form.Subscribe
              selector={(formState) => [
                formState.canSubmit,
                formState.isSubmitting,
                formState.isDirty,
              ]}
            >
              {([canSubmit, isSubmitting]) => {
                return (
                  <Button
                    type="submit"
                    disabled={!canSubmit}
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
        <div className="w-full overflow-hidden md:inline-block hidden h-full py-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                <h1 className="text-2xl font-bold break-all">
                  {String(title.state.value ?? "") || "Title of the item"}
                </h1>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col justify-between relative">
              <div className="flex flex-col gap-4">
                <p className="text-xl font-semibold ">
                  €{" "}
                  {Number(price.state.value)
                    ? (Number(price.state.value) / 100).toFixed(2)
                    : "0.00"}
                </p>

                <div className="min-h-[450px]">
                  <Slider
                    images={
                      images.state.value && Array.isArray(images.state.value)
                        ? images.state.value.map((file: File, i) => {
                            const imageUrl = URL.createObjectURL(file);

                            return (
                              <div
                                key={i}
                                onClick={() => {
                                  setFullscreenImage(imageUrl);
                                }}
                              >
                                <Image
                                  fill
                                  className="object-cover hover:cursor-pointer"
                                  src={imageUrl}
                                  alt=""
                                />
                              </div>
                            );
                          })
                        : placeholderImages.map((item, i) => (
                            <Image
                              key={i}
                              fill
                              className="object-cover"
                              src={item.url}
                              alt={item.alt}
                            />
                          ))
                    }
                    thumbnails={
                      images.state.value && Array.isArray(images.state.value)
                        ? images.state.value.map((file: File, i) => {
                            const thumbUrl = URL.createObjectURL(file);
                            return (
                              <Image
                                key={i}
                                fill
                                className="object-cover hover:cursor-pointer"
                                src={thumbUrl}
                                alt=""
                              />
                            );
                          })
                        : placeholderImages.map((item, i) => (
                            <Image
                              key={i}
                              fill
                              className="object-cover"
                              src={item.url}
                              alt={item.alt}
                            />
                          ))
                    }
                  />

                  {/* image Fullscreen Preview (doesn't work on initial placeholder images) */}
                  <AnimatePresence>
                    {fullscreenImage && (
                      <motion.div
                        className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setFullscreenImage(null)}
                      >
                        <motion.img
                          src={fullscreenImage}
                          alt="Fullscreen"
                          className="h-full p-12 object-contain"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="text-gray-200 whitespace-pre-wrap max-h-60 overflow-auto break-all">
                  {String(description.state.value ?? "") ||
                    "Your item description will appear here..."}
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
