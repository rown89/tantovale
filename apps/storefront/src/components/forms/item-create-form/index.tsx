"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useField } from "@tanstack/react-form";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Euro } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Spinner } from "@workspace/ui/components/spinner";
import MultiImageUpload from "@workspace/ui/components/image-uploader/multi-image-uploader";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { useCategoriesData } from "@workspace/shared/hooks/use-categories-data";
import { useCitiesData } from "@workspace/shared/hooks/use-cities-data";
import { CategorySelector } from "#components/category-selector";
import { DynamicProperties } from "./components/dynamic-properties";
import { ItemDetailCard } from "@workspace/ui/components/item-detail-card/index";
import { Badge } from "@workspace/ui/components/badge";
import { formatPriceToCents } from "@workspace/ui/lib/utils";
import { Switch } from "@workspace/ui/components/switch";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@workspace/ui/components/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";

import useTantovaleStore from "#stores";
import { CitySelector } from "#components/forms/commons/city-selector";
import { useCreateItemForm } from "./use-create-item-form";
import { FieldInfo } from "../utils/field-info";
import { nestedSubCatHierarchy } from "../../../utils/nested-subcat-hierarchy";

import type { Category } from "@workspace/server/extended_schemas";

const maxImages = 5;

export default function CreateItemFormComponent({
  subcategory,
}: {
  subcategory?: Omit<Category, "category_id" | "parent_id" | "subcategories">;
}) {
  const { setCommons, setImages, setProperties } = useTantovaleStore();

  const [nestedSubcategories, setNestedSubcategories] = useState<
    Pick<Category, "id" | "name" | "subcategories">[]
  >([]);
  const [searchedCityName, setSearchedCityName] = useState("");
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<
    { id: number; name: string; slug: string } | undefined
  >();
  const [selectedDeliveryMethod, setSelectedDeliveryMethod] =
    useState<string[]>();
  const [isCustomShippingPriceEnabled, setIsCustomShippingPriceEnabled] =
    useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const {
    allCategories,
    allSubcategories,
    subCatProperties,
    isLoadingCat,
    isLoadingSubCat,
    isLoadingSubCatProperties,
  } = useCategoriesData(subcategory?.id);

  const { cities, isLoadingCities } = useCitiesData(searchedCityName);

  const {
    form,
    isSubmittingForm,
    selectedSubCategory,
    isCityPopoverOpen,
    setIsCityPopoverOpen,
    handleSubCategorySelect,
    handlePropertiesReset,
  } = useCreateItemForm({
    subcategory,
    subCatProperties,
  });

  const title = useField({ form, name: "commons.title" }).state.value;
  const price = useField({ form, name: "commons.price" }).state.value;
  const description = useField({ form, name: "commons.description" }).state
    .value;
  const easyPay = useField({ form, name: "commons.easy_pay" }).state.value;
  const city = useField({ form, name: "commons.city" }).state.value;
  const images = useField({ form, name: "images" }).state
    .value as unknown as File[];
  const properties = useField({ form, name: "properties" }).state.value;

  const deliveryMethodProperty = useMemo(() => {
    return subCatProperties?.find((item) => item.slug === "delivery_method");
  }, [subCatProperties]);

  useEffect(() => {
    if (!properties?.length) return;

    // Handle condition selection
    const conditionProperty = properties.find(
      (item) => item.slug === "condition",
    );
    const selectedConditionId = conditionProperty?.value;

    if (selectedConditionId) {
      const conditionFilter = subCatProperties?.find(
        (item) => item.slug === "condition",
      );
      const extractedCondition = conditionFilter?.options.find(
        (item) => item.id === Number(selectedConditionId),
      );

      if (extractedCondition) {
        setSelectedCondition({
          id: extractedCondition.id,
          name: extractedCondition.name,
          slug: String(extractedCondition.value),
        });
      }
    }

    // Handle delivery methods selection
    const deliveryProperty = properties.find(
      (item) => item.slug === "delivery_method",
    );
    const selectedDeliveryMethodsIds = deliveryProperty?.value;

    if (
      Array.isArray(selectedDeliveryMethodsIds) &&
      selectedDeliveryMethodsIds.length
    ) {
      const deliveryMethodFilter = subCatProperties?.find(
        (item) => item.slug === "delivery_method",
      );

      const extractedDeliveryMethods = selectedDeliveryMethodsIds
        .map(
          (methodId) =>
            deliveryMethodFilter?.options.find(
              (option) => option.id === Number(methodId),
            )?.value,
        )
        .filter(Boolean)
        .map(String);

      setSelectedDeliveryMethod(extractedDeliveryMethods);
    } else {
      setSelectedDeliveryMethod([]);
    }
  }, [properties, subCatProperties]);

  useEffect(() => {
    // if on mount we have a subcategory already settled in query params:
    if (subcategory) {
      handleSubCategorySelect(subcategory);

      // set the initial NewItemStore values
      setCommons({
        title: "",
        easy_pay: false,
        description: "",
        price: 0,
        shipping_price: 0,
        subcategory_id: subcategory.id,
        city: 0,
      });
      setImages([]);
      setProperties(subCatProperties ?? []);
    }
  }, [subcategory, subCatProperties]);

  useEffect(() => {
    // build menu hierarchy:
    if (allCategories?.length && allSubcategories?.length) {
      const nestedMenu = nestedSubCatHierarchy(allSubcategories, allCategories);

      if (nestedMenu.length) setNestedSubcategories(nestedMenu);
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

  function removeDeliveryMethodProperty() {
    const properties = form.getFieldValue("properties") || [];

    form.setFieldValue("properties", [
      ...properties.filter(
        (property) =>
          property.id !== deliveryMethodProperty?.id &&
          property.slug !== deliveryMethodProperty?.slug,
      ),
    ]);

    return properties;
  }

  return (
    <div className="container mx-auto py-6 px-6 lg:px-2 xl:px-0 h-[calc(100vh-56px)]">
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
            <div className="overflow-auto flex gap-6 flex-col p-0 md:pr-3">
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

                          if (e) {
                            handleSubCategorySelect(e);
                            setValue(e.id ?? 0);
                          }
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
                      <div className="flex gap-1 items-center">
                        <Euro className="h-4 w-4" />
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
                                ? formatPriceToCents(e.target.valueAsNumber)
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
                      </div>
                      <FieldInfo field={field} />
                    </div>
                  );
                }}
              </form.Field>
              <form.Field name="images">
                {(field) => {
                  const { handleChange } = field;

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
                        minLength={50}
                        maxLength={2500}
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
              {/* Only show Easy Pay if the subcategory is payable and deliveryMethodPropertyId exists */}
              {subcategory?.is_payable && deliveryMethodProperty?.id && (
                <form.Field name="commons.easy_pay">
                  {(field) => {
                    const { name, handleChange, state } = field;
                    const { meta, value } = state;

                    function handlePayableChange(checked: boolean) {
                      handleChange(checked);

                      const properties = form.getFieldValue("properties") || [];

                      if (checked) {
                        form.setFieldValue("commons.shipping_price", 0);
                        setIsCustomShippingPriceEnabled(false);

                        if (deliveryMethodProperty?.id) {
                          removeDeliveryMethodProperty();
                          // add the delivery method "shipping_prepaid" to the properties array
                          form.setFieldValue("properties", [
                            ...properties,
                            {
                              id: deliveryMethodProperty?.id,
                              slug: deliveryMethodProperty.slug,
                              value: "shipping_prepaid",
                            },
                          ]);
                        }
                      } else {
                        // remove the delivery method "shipping_prepaid" from the properties array if it exists
                        if (deliveryMethodProperty?.id) {
                          const updatedProperties =
                            removeDeliveryMethodProperty();

                          form.setFieldValue("properties", updatedProperties);
                        }
                      }
                    }

                    return (
                      <div className="space-y-2">
                        <Alert
                          className={`py-4 cursor-pointer ${easyPay ? "border-1 border-primary" : ""}`}
                          onClick={() => handlePayableChange(!value)}
                        >
                          <AlertTitle className="mb-2 flex gap-2 justify-between">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <div className="flex gap-2 items-center">
                                    <p
                                      className={`font-bold text-lg ${easyPay ? "text-primary" : ""}`}
                                    >
                                      Easy Pay
                                    </p>
                                    <Info className="h-4 w-4 text-blue-500" />
                                  </div>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                  <DialogHeader>
                                    <DialogTitle>What is Easy Pay?</DialogTitle>
                                    <DialogDescription className="my-2">
                                      With Easy Pay, selling your items online
                                      is simple and secure.
                                      <br />
                                      <br />
                                      Once a buyer completes the purchase, the
                                      payment is safely held by our system until
                                      you ship the item.
                                      <br />
                                      After the buyer confirms delivery, we
                                      promptly release the funds to your
                                      account.
                                      <br />
                                      <br />
                                      This process helps protect both you and
                                      the buyer, ensuring a smooth and
                                      trustworthy transaction.
                                    </DialogDescription>
                                  </DialogHeader>
                                </DialogContent>
                              </Dialog>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              <Switch
                                id={name}
                                name={name}
                                onCheckedChange={(checked) => {
                                  handlePayableChange(checked);
                                  // When enabling Easy Pay, disable manual shipping
                                  if (checked) {
                                    setIsCustomShippingPriceEnabled(false);

                                    form.setFieldValue(
                                      "commons.shipping_price",
                                      0,
                                    );
                                  }
                                }}
                                checked={value !== undefined ? value : false}
                              />
                            </div>
                          </AlertTitle>
                          <AlertDescription>
                            Enabling this option allows users to instantly
                            purchase your item, with secure payment processing
                            and tracking from payment to shipment.
                          </AlertDescription>
                        </Alert>
                      </div>
                    );
                  }}
                </form.Field>
              )}

              {subcategory?.is_payable && (
                <form.Field name="commons.shipping_price">
                  {(field) => {
                    const { name, handleChange, state } = field;
                    const { meta, value } = state;
                    const { isTouched, errors } = meta;

                    console.log(value);

                    return (
                      <div className="space-y-2">
                        <div className="space-y-2">
                          <Alert
                            className={`py-4 cursor-pointer ${isCustomShippingPriceEnabled ? "border-1 border-primary" : ""}`}
                            onClick={() => {
                              setIsCustomShippingPriceEnabled(
                                !isCustomShippingPriceEnabled,
                              );

                              const properties =
                                form.getFieldValue("properties") || [];

                              if (easyPay) {
                                form.setFieldValue("commons.easy_pay", false);
                                setIsCustomShippingPriceEnabled(true);
                              }

                              // if "delivery_method" property exists and "custom shipping" is not enabled
                              if (
                                deliveryMethodProperty?.id &&
                                !isCustomShippingPriceEnabled
                              ) {
                                form.setFieldValue("commons.easy_pay", false);
                                // remove "shipping_prepaid" from the properties array
                                removeDeliveryMethodProperty();

                                // add "shipping" to the properties array
                                form.setFieldValue("properties", [
                                  ...properties,
                                  {
                                    id: deliveryMethodProperty?.id,
                                    slug: deliveryMethodProperty.slug,
                                    value: "shipping",
                                  },
                                ]);
                              } else {
                                // remove "shipping" from the properties array
                                removeDeliveryMethodProperty();
                              }
                            }}
                          >
                            <AlertTitle className="mb-2 flex gap-2 justify-between">
                              <div onClick={(e) => e.stopPropagation()}>
                                <p
                                  className={`font-bold text-lg ${isCustomShippingPriceEnabled ? "text-primary" : ""}`}
                                >
                                  Manual shipping
                                </p>
                              </div>
                              <div onClick={(e) => e.stopPropagation()}>
                                <Switch
                                  onCheckedChange={(checked) => {
                                    setIsCustomShippingPriceEnabled(checked);

                                    // When enabling manual shipping, disable Easy Pay
                                    if (checked && easyPay) {
                                      form.setFieldValue(
                                        "commons.easy_pay",
                                        false,
                                      );
                                    }
                                  }}
                                  checked={isCustomShippingPriceEnabled}
                                />
                              </div>
                            </AlertTitle>
                            <AlertDescription>
                              Enable this option to arrange the shipment by
                              yourself.
                              <div className="flex flex-col gap-2">
                                <div className="flex gap-1 items-center">
                                  <Euro className="h-4 w-4" />
                                  <Input
                                    id={field.name}
                                    name={field.name}
                                    className="my-4"
                                    disabled={
                                      easyPay ||
                                      !isCustomShippingPriceEnabled ||
                                      isSubmittingForm
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    type="number"
                                    min=".01"
                                    step=".01"
                                    placeholder="ex: 15.50"
                                  />
                                </div>
                                <FieldInfo field={field} />
                              </div>
                            </AlertDescription>
                          </Alert>
                        </div>
                      </div>
                    );
                  }}
                </form.Field>
              )}

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
                (isLoadingCat ||
                isLoadingSubCat ||
                isLoadingSubCatProperties ? (
                  <Spinner />
                ) : (
                  subCatProperties &&
                  subCatProperties?.length > 0 &&
                  subCatProperties?.map((property) => {
                    return (
                      <form.Field key={property.id} name="properties">
                        {(field) => (
                          <DynamicProperties
                            property={property}
                            field={field}
                          />
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
                      isLoadingSubCatProperties ||
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
          <div className="w-full overflow-hidden h-full max-w-[760px] mx-auto">
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
                subcategory: selectedSubCategory && (
                  <Link
                    href={`/items/condition/${selectedSubCategory.slug ?? "#"}`}
                    target="_blank"
                    className="mb-2"
                  >
                    <Badge variant="outline" className="text-sm bg-accent px-3">
                      {selectedSubCategory.name}
                    </Badge>
                  </Link>
                ),
                condition: selectedCondition && (
                  <Link
                    href={`/items/category/${selectedCondition.slug ?? "#"}`}
                    target="_blank"
                    className="mb-2"
                  >
                    <Badge
                      variant="outline"
                      className="text-sm bg-primary px-3"
                    >
                      {selectedCondition.name}
                    </Badge>
                  </Link>
                ),
                deliveryMethods: selectedDeliveryMethod,
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
