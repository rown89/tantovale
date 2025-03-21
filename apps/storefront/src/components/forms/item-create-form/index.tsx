"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useField } from "@tanstack/react-form";
import { motion, AnimatePresence } from "framer-motion";

import { delivery_method_types, placeholderImages } from "./constants";

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

import Slider from "@workspace/ui/components/carousel/slider";
import MultiImageUpload from "@workspace/ui/components/image-uploader/multi-image-uploader";
import { useItemCreate } from "#components/forms/item-create-form/hooks/useItemCreate";

import { FieldInfo } from "../utils/field-info";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

export default function CreateItemForm({
  subcategory,
}: {
  subcategory?: Omit<Category, "subcategories">;
}) {
  const {
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
  } = useItemCreate(subcategory);

  const title = useField({ form, name: "commons.title" });
  const price = useField({ form, name: "commons.price" });
  const description = useField({ form, name: "commons.description" });
  const subcategory_id = useField({ form, name: "commons.subcategory_id" });
  const properties = useField({ form, name: "properties" });
  const images = useField({ form, name: "images" });

  // Effects
  useEffect(() => {
    // if we have a subcategory already settled in the query params:
    if (subcategory) handleSubCategorySelect(subcategory);
  }, []);

  useEffect(() => {
    // build category (subcategory) menu hierarchy:
    if (allCategories?.length && allSubcategories?.length) {
      buildNestedSubCatHierarchy();
    }
  }, [allCategories, allSubcategories]);

  // Close fullscreen image on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
                        onValueChange={(value) => field.handleChange(value)}
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
                    //  disabled={!canSubmit}
                    disabled={isSubmittingForm}
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
