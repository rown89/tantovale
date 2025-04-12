"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useField } from "@tanstack/react-form";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Spinner } from "@workspace/ui/components/spinner";
import MultiImageUpload from "@workspace/ui/components/image-uploader/multi-image-uploader";
import { CitySelector } from "#components/forms/commons/city-selector";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { useCategoriesData } from "@workspace/shared/hooks/use-categories-data";
import { useCitiesData } from "@workspace/shared/hooks/use-cities-data";
import { CategorySelector } from "#components/category-selector";
import { DynamicProperties } from "./components/dynamic-properties";
import { ItemDetailCard } from "#components/item-card";
import { FieldInfo } from "../utils/field-info";
import { useCreateItemForm } from "./use-create-item-form";
import { nestedSubCatHierarchy } from "../../../utils/nested-subcat-hierarchy";

import type { Category } from "@workspace/shared/types/category";

const maxImages = 5;

export default function CreateItemFormComponent({
  subcategory,
}: {
  subcategory?: Omit<Category, "subcategories">;
}) {
  const [nestedSubcategories, setNestedSubcategories] = useState<Category[]>(
    [],
  );
  const [searchedCityName, setSearchedCityName] = useState("");
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const {
    allCategories,
    allSubcategories,
    subCatFilters,
    isLoadingCat,
    isLoadingSubCat,
    isLoadingSubCatFilters,
  } = useCategoriesData(subcategory);

  const { cities, isLoadingCities } = useCitiesData(searchedCityName);

  const {
    form,
    isSubmittingForm,
    selectedSubCategory,
    isCityPopoverOpen,
    setIsCityPopoverOpen,
    handleSubCategorySelect,
    handlePropertiesReset,
  } = useCreateItemForm({ subcategory, subCatFilters });

  const title = useField({ form, name: "commons.title" }).state.value;
  const price = useField({ form, name: "commons.price" }).state.value;
  const description = useField({ form, name: "commons.description" }).state
    .value;
  const city = useField({ form, name: "commons.city" }).state.value;
  const images = useField({ form, name: "images" }).state
    .value as unknown as File[];

  useEffect(() => {
    // if on mount we have a subcategory already settled in query params:
    if (subcategory) handleSubCategorySelect(subcategory);
  }, []);

  useEffect(() => {
    // build menu hierarchy:
    if (allCategories?.length && allSubcategories?.length) {
      const nestedMenu = nestedSubCatHierarchy(allSubcategories, allCategories);
      setNestedSubcategories(nestedMenu);
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

  // Create image URLs for preview - properly formatted for the Slider component
  const imageUrls = useMemo(() => {
    return images?.map((file, i) => {
      const imageUrl = URL.createObjectURL(file);
      return (
        <div
          key={i}
          onClick={() => {
            setFullscreenImage(imageUrl);
          }}
        >
          <Image
            className="object-cover hover:cursor-pointer"
            fill
            src={imageUrl}
            alt=""
          />
        </div>
      );
    });
  }, [images]);

  const thumbImagesUrls = useMemo(() => {
    return images?.map((file, i) => {
      const imageUrl = URL.createObjectURL(file);
      return (
        <Image
          key={i}
          className="object-cover hover:cursor-pointer"
          fill
          src={imageUrl}
          alt=""
        />
      );
    });
  }, [images]);

  return (
    <div className="container mx-auto py-6 px-6 h-[calc(100vh-56px)]">
      <div className="flex gap-6 h-full">
        {/* Left Column - Form */}
        <div className="w-full xl:max-w-[500px] h-full break-words">
          {/* 
            Debug stringify
            JSON.stringify(form.state.errors, null, 4) 
          */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-4 w-full h-full flex flex-col justify-between"
          >
            <div className="overflow-auto flex gap-6 flex-col p-2">
              <form.Field
                name="commons.subcategory_id"
                defaultValue={selectedSubCategory?.id}
              >
                {({ setValue }) => {
                  return (
                    <div className="space-y-2">
                      <Label className="block">
                        Category <span className="text-red-500">*</span>
                      </Label>
                      <CategorySelector
                        isLoading={isLoadingCat || isLoadingSubCat}
                        categories={nestedSubcategories}
                        selectedCategoryControlled={
                          selectedSubCategory || subcategory
                        }
                        onSelect={(e) => {
                          handlePropertiesReset();
                          handleSubCategorySelect(e);
                          setValue(e.id);
                        }}
                      />
                    </div>
                  );
                }}
              </form.Field>
              <form.Field name="commons.title">
                {(field) => {
                  const { name, handleBlur, handleChange, state } = field;
                  const { meta, value } = state;

                  return (
                    <div className="space-y-2">
                      <Label htmlFor={name} className="block">
                        Title <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id={name}
                        name={name}
                        disabled={isSubmittingForm}
                        value={value !== undefined ? value?.toString() : ""}
                        onBlur={handleBlur}
                        onChange={(e) => handleChange(e.target.value)}
                        aria-invalid={
                          meta.isTouched && meta.errors?.length
                            ? "true"
                            : "false"
                        }
                        className={
                          meta.isTouched && meta.errors?.length
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
                  const { name, handleBlur, handleChange, state } = field;
                  const { meta, value } = state;
                  const { isTouched, errors } = meta;

                  return (
                    <div className="space-y-2">
                      <Label htmlFor={name} className="block">
                        Price <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id={name}
                        name={name}
                        disabled={isSubmittingForm}
                        type="number"
                        min=".01"
                        step=".01"
                        placeholder="0.20"
                        value={
                          value !== undefined
                            ? ((value as number) / 100).toString()
                            : ""
                        }
                        onBlur={handleBlur}
                        onChange={(e) => {
                          handleChange(
                            e.target.value
                              ? Math.round(e.target.valueAsNumber * 100)
                              : 0,
                          );
                        }}
                        aria-invalid={
                          isTouched && errors?.length ? "true" : "false"
                        }
                        className={
                          isTouched && errors?.length ? "border-red-500" : ""
                        }
                      />
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>
              <form.Field name="images">
                {(field) => {
                  const { state, handleChange } = field;
                  const { meta } = state;

                  return (
                    <div className="space-y-2">
                      <MultiImageUpload
                        fileInputRef={fileInputRef}
                        maxImages={maxImages}
                        onImagesChange={(images) => {
                          if (images) handleChange(images as any);
                        }}
                      />
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>
              <form.Field name="commons.description">
                {(field) => {
                  const { name, handleBlur, handleChange, state } = field;
                  const { meta, value } = state;
                  const { isTouched, errors } = meta;

                  return (
                    <div className="space-y-2">
                      <Label htmlFor={name} className="block">
                        Description <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id={name}
                        name={name}
                        disabled={isSubmittingForm}
                        rows={6}
                        maxLength={800}
                        value={value !== undefined ? value?.toString() : ""}
                        onBlur={handleBlur}
                        onChange={(e) => handleChange(e.target.value)}
                        placeholder="Enter a description for your item"
                        aria-invalid={
                          isTouched && errors?.length ? "true" : "false"
                        }
                        className={
                          isTouched && errors?.length
                            ? "border-red-500 max-h-52"
                            : "max-h-52"
                        }
                      />
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>
              <form.Field name="commons.city">
                {(field) => {
                  const { name, handleBlur, setValue, state } = field;
                  const { meta, value } = state;
                  const { isTouched, errors } = meta;

                  return (
                    <div className="space-y-2">
                      <Label htmlFor={field.name} className="block">
                        Item location <span className="text-red-500">*</span>
                      </Label>
                      <CitySelector
                        value={Number(value)}
                        onChange={setValue}
                        onBlur={handleBlur}
                        name={name}
                        isTouched={isTouched}
                        hasErrors={errors?.length > 0}
                        cities={cities}
                        isLoadingCities={isLoadingCities}
                        isSubmittingForm={isSubmittingForm}
                        onSearchChange={setSearchedCityName}
                        isCityPopoverOpen={isCityPopoverOpen}
                        setIsCityPopoverOpen={setIsCityPopoverOpen}
                      />
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>
              {selectedSubCategory &&
                (isLoadingCat || isLoadingSubCat || isLoadingSubCatFilters ? (
                  <Spinner />
                ) : (
                  subCatFilters &&
                  subCatFilters?.length > 0 &&
                  subCatFilters?.map((filter) => {
                    return (
                      <form.Field key={filter.id} name="properties">
                        {(field) => (
                          <DynamicProperties filter={filter} field={field} />
                        )}
                      </form.Field>
                    );
                  })
                ))}
            </div>
            <form.Subscribe
              selector={(formState) => ({
                canSubmit: formState.canSubmit,
                isSubmitting: formState.isSubmitting,
                isDirty: formState.isDirty,
              })}
            >
              {(state) => {
                const { canSubmit, isSubmitting } = state;
                return (
                  <Button
                    type="submit"
                    disabled={
                      !selectedSubCategory ||
                      isSubmittingForm ||
                      isLoadingCat ||
                      isLoadingSubCat ||
                      isLoadingSubCatFilters ||
                      !canSubmit
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

        {/* Right Column - Item Preview */}
        {!isMobile && (
          <div className="w-full overflow-hidden h-full">
            <ItemDetailCard
              isPreview
              imagesRef={fileInputRef}
              maxImages={maxImages}
              item={{
                title: title !== undefined ? String(title) : "",
                price: price !== undefined ? Number(price) : 0,
                city: cities?.find((item) => item.id === city)?.name || "",
                description:
                  description !== undefined ? String(description) : "",
                images: imageUrls?.length ? imageUrls : [],
                subcategory: { name: selectedSubCategory?.name || "" },
              }}
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
        )}
      </div>
    </div>
  );
}
