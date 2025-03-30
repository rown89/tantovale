"use client";
import { useEffect, useState } from "react";
import { useField } from "@tanstack/react-form";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Spinner } from "@workspace/ui/components/spinner";
import MultiImageUpload from "@workspace/ui/components/image-uploader/multi-image-uploader";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command";
import { cn } from "@workspace/ui/lib/utils";
import { FieldInfo } from "../utils/field-info";
import { useCreateItemForm } from "./hooks/useCreateItemForm";
import { useCreateItemData } from "./hooks/useCreateItemData";
import ItemPreview from "./components/item-preview";
import { CategorySelector } from "#components/category-selector";
import { Check, ChevronsUpDown, SearchIcon } from "lucide-react";
import { DynamicProperties } from "./components/dynamic-properties";

export interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

interface CreateItemFormComponentProps {
  subcategory?: Omit<Category, "subcategories">;
}

export default function CreateItemFormComponent({
  subcategory,
}: CreateItemFormComponentProps) {
  const [nestedSubcategories, setNestedSubcategories] = useState<Category[]>(
    [],
  );
  const [searchedCityName, setSearchedCityName] = useState("");

  const isMobile = useIsMobile();

  const {
    allCategories,
    allSubcategories,
    subCatFilters,
    isLoadingCat,
    isLoadingSubCat,
    cities,
    isLoadingSubCatFilters,
    isLoadingCities,
  } = useCreateItemData(subcategory, searchedCityName);

  const {
    form,
    isSubmittingForm,
    selectedSubCategory,
    isCityPopoverOpen,
    setIsCityPopoverOpen,
    handleSubCategorySelect,
  } = useCreateItemForm({ subcategory, subCatFilters });

  // @ts-expect-error tanstack form library bug https://github.com/TanStack/form/issues/891
  const title = useField({ form, name: "commons.title" }).state.value;
  const price = useField({ form, name: "commons.price" }).state.value;
  const description = useField({ form, name: "commons.description" }).state
    .value;
  const city = useField({ form, name: "commons.city" }).state.value;
  const images = useField({ form, name: "images" }).state.value;

  // Helper function to build nested subcategory hierarchy for CategorySelector
  function buildNestedSubCatHierarchy() {
    // Convert subcategories array into a nested structure
    const subcategoryMap = new Map<
      number,
      {
        id: number;
        name: string;
        category_id: number;
        parent_id: number | null;
        subcategories: Category[];
      }
    >();

    // Initialize subcategories map
    allSubcategories?.forEach((sub) => {
      subcategoryMap.set(sub.id, { ...sub, subcategories: [] });
    });

    // Build the hierarchy by linking parent subcategories
    allSubcategories?.forEach((sub) => {
      if (sub.parent_id) {
        const parent = subcategoryMap.get(sub.parent_id);
        if (parent) {
          const subItem = subcategoryMap.get(sub.id);
          if (subItem && parent && parent?.subcategories) {
            parent?.subcategories.push(subItem);
          }
        }
      }
    });

    if (allCategories?.length && allSubcategories?.length) {
      // Attach subcategories to categories
      const categoriesWithSubcategories = allCategories?.map((category) => ({
        ...category,
        subcategories: allSubcategories
          ?.filter((sub) => sub.category_id === category.id && !sub.parent_id)
          .map((sub) => subcategoryMap.get(sub.id))
          .filter((sub): sub is NonNullable<typeof sub> => sub !== undefined),
      }));

      setNestedSubcategories(categoriesWithSubcategories);
    }
  }

  function handleResetPartialForm(e: Category) {
    // Reset only properties, not the entire form
    form.reset({
      // Preserve the images when resetting
      commons: {
        title,
        price,
        description,
        city,
        subcategory_id: e.id,
      },
      images: form.getFieldValue("images"),
      properties: [],
    });
  }

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

  return (
    <div className="container mx-auto py-6 px-6 h-[calc(100vh-56px)]">
      <div className="flex gap-6 h-full">
        {/* Left Column - Form */}
        <div className="w-full xl:max-w-[500px] h-full break-words">
          {/* 
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
                {(field) => {
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
                          handleResetPartialForm(e);
                          handleSubCategorySelect(e);
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
                        disabled={isSubmittingForm}
                        value={
                          field.state.value !== undefined
                            ? field.state.value?.toString()
                            : ""
                        }
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
                        disabled={isSubmittingForm}
                        type="number"
                        min=".01"
                        step=".01"
                        placeholder="0.20"
                        value={
                          field.state.value !== undefined
                            ? ((field.state.value as number) / 100).toString()
                            : ""
                        }
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          field.handleChange(
                            e.target.value
                              ? Math.round(e.target.valueAsNumber * 100)
                              : 0,
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
                    <div className="space-y-2">
                      <MultiImageUpload
                        maxImages={5}
                        onImagesChange={(images) => {
                          if (images) {
                            field.handleChange(images as [File, ...File[]]);
                          }
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
                        disabled={isSubmittingForm}
                        rows={6}
                        maxLength={800}
                        value={
                          field.state.value !== undefined
                            ? field.state.value?.toString()
                            : ""
                        }
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
              <form.Field name="commons.city">
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Label htmlFor={field.name} className="block">
                        Item location <span className="text-red-500">*</span>
                      </Label>
                      <Popover
                        open={isCityPopoverOpen}
                        onOpenChange={setIsCityPopoverOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isCityPopoverOpen}
                            className="w-full justify-between"
                          >
                            {cities?.find(
                              (city) => city.id === Number(field.state.value),
                            )?.name ?? "Location..."}
                            <ChevronsUpDown className="opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="min-w-[300px] flex p-0"
                        >
                          <Command>
                            <div className="flex items-center gap-2 mx-2">
                              <SearchIcon width={20} />
                              <Input
                                id={field.name}
                                name={field.name}
                                disabled={isSubmittingForm}
                                onBlur={field.handleBlur}
                                onChange={(e) => {
                                  field.handleChange(e.target.valueAsNumber);
                                  setSearchedCityName(e.target.value);
                                }}
                                aria-invalid={
                                  field.state.meta.isTouched &&
                                  field.state.meta.errors?.length
                                    ? "true"
                                    : "false"
                                }
                                className={`my-2 ${
                                  field.state.meta.isTouched &&
                                  field.state.meta.errors?.length
                                    ? "border-red-500"
                                    : ""
                                }`}
                                placeholder="Search a city name"
                              />
                            </div>
                            {cities && cities?.length > 0 && (
                              <CommandList>
                                {!isLoadingCities &&
                                  searchedCityName.length > 2 &&
                                  !cities?.length && (
                                    <CommandEmpty>
                                      No places found.
                                    </CommandEmpty>
                                  )}
                                <CommandGroup>
                                  {cities?.map((city, i) => {
                                    return (
                                      <CommandItem
                                        key={i}
                                        value={city.id?.toString()}
                                        className="hover:font-bold"
                                        onSelect={(currentValue) => {
                                          field.setValue(
                                            currentValue ===
                                              field.state.value.toString()
                                              ? 0
                                              : Number(currentValue),
                                          );

                                          setIsCityPopoverOpen(false);
                                        }}
                                      >
                                        {city.name}
                                        <Check
                                          className={cn(
                                            "ml-auto",
                                            Number(field.state.value) ===
                                              city.id
                                              ? "opacity-100"
                                              : "opacity-0",
                                          )}
                                        />
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            )}
                          </Command>
                        </PopoverContent>
                      </Popover>
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

        {/* Right Column - Preview */}
        {!isMobile && (
          <div className="w-full overflow-hidden  h-full">
            <ItemPreview
              title={
                form.getFieldValue("commons.title") !== undefined
                  ? String(form.getFieldValue("commons.title"))
                  : ""
              }
              price={price !== undefined ? Number(price) : 0}
              description={description !== undefined ? String(description) : ""}
              images={images && Array.isArray(images) ? images : []}
              subcategory={selectedSubCategory?.name || ""}
            />
          </div>
        )}
      </div>
    </div>
  );
}
