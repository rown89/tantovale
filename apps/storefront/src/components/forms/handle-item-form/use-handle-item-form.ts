import { useMemo, useState } from "react";
import { AnyFieldApi, useForm } from "@tanstack/react-form";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";

import { client } from "@workspace/server/client-rpc";
import {
  createItemSchema,
  multipleImagesSchema,
  propertySchema,
} from "@workspace/server/extended_schemas";

import { updatePropertiesArray } from "./utils";
import { handleQueryParamChange } from "../../../utils/handle-qp";
import { PropertyType } from "./types";
import { formOpts } from "./constants";

import type { Category } from "@workspace/server/extended_schemas";

export interface UseItemFormProps {
  subcategory?: Partial<Category>;
  subCatProperties: PropertyType[] | undefined;
}

export const reshapedCreateItemSchema = ({
  propertiesData,
  isManualShipping,
}: {
  propertiesData?: PropertyType[];
  isManualShipping?: boolean;
}) => {
  return createItemSchema
    .and(
      z.object({
        images: multipleImagesSchema,
      }),
    )
    .and(
      z
        .object({
          properties: propertySchema,
        })
        // Check if all required subcat properties are satisfied
        .superRefine((val, ctx) => {
          propertiesData?.forEach((property) => {
            if (
              property.on_item_create_required &&
              !val.properties?.find((p) => p.slug === property.slug)?.value
            ) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This field is required",
                path: ["properties", property.slug],
              });
            }
          });
        }),
    )
    .and(
      z.object({
        shipping_price: z.number().refine(
          (val) => {
            // if isSubcategoryPayable is false, then shipping_price must be 0 or undefined
            if (isManualShipping) {
              return val > 0;
            } else {
              return val === 0 || val === undefined;
            }
          },
          {
            message: "Shipping price must be greater than 0",
          },
        ),
      }),
    );
};

type schemaType = z.infer<ReturnType<typeof reshapedCreateItemSchema>>;

export function useHandleItemForm({
  subcategory,
  subCatProperties,
}: UseItemFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedSubCategory, setSelectedSubCategory] = useState<
    Partial<Category> | undefined
  >(subcategory);
  const [isCityPopoverOpen, setIsCityPopoverOpen] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isPickup, setIsPickup] = useState(false);
  const [isManualShipping, setIsManualShipping] = useState(false);

  const deliveryMethodProperty = useMemo(() => {
    return subCatProperties?.find((item) => item.slug === "delivery_method");
  }, [subCatProperties]);

  const form = useForm({
    ...formOpts.defaultValues,
    asyncAlways: true,
    validators: {
      onChange: reshapedCreateItemSchema({
        propertiesData: subCatProperties ?? [],
        isManualShipping,
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
            // @ts-ignore TODO: check it
            images.map(async (image) => {
              try {
                // @ts-ignore TODO: check it
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

        router.push(`/item/${value.commons.title}-${newItem.item_id}`);
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

  function handlePropertiesReset() {
    form.setFieldValue("properties", []);
  }

  function handleSubCategorySelect(subcategory?: Partial<Category>) {
    if (!subcategory) return;

    setSelectedSubCategory(subcategory);
    const field = form.getFieldValue("commons.subcategory_id");

    if (
      subcategory?.id &&
      field &&
      typeof field === "object" &&
      "setValue" in field
    ) {
      (field as { setValue: (value: number) => void }).setValue(subcategory.id);
    }

    handleQueryParamChange(
      "cat",
      subcategory?.id?.toString() ?? "",
      searchParams,
      router,
    );
  }

  function handlePickupChange(
    value: boolean,
    field: AnyFieldApi,
    easyPay?: boolean,
  ) {
    if (easyPay) {
      form.setFieldValue("commons.easy_pay", false);
      form.setFieldValue("shipping_price", 0);
      setIsManualShipping(false);
    }

    setIsPickup(value);

    if (value) {
      form.setFieldValue("shipping_price", 0);
      setIsManualShipping(false);

      // Only update delivery methods if the property exists
      if (deliveryMethodProperty?.id) {
        const deliveryValue = deliveryMethodProperty.options.find(
          (option) => option.value === "pickup",
        )?.id;

        if (!deliveryValue) return;

        // Add "shipping" to the properties array, use the field of properties to update the array
        updatePropertiesArray({
          value: deliveryValue,
          property: deliveryMethodProperty,
          field,
        });
      }
    } else {
      // remove "pickup" from the properties array
      removeDeliveryMethodProperty();
    }
  }

  function handleEasyPayChange(
    checked: boolean,
    field: AnyFieldApi,
    propertiesField: AnyFieldApi,
  ) {
    // Update the Easy Pay form field value
    field.handleChange(checked);

    // Handle shipping and delivery method properties
    if (checked) {
      // When enabling Easy Pay, reset shipping price and disable manual shipping

      form.setFieldValue("shipping_price", 0);
      setIsManualShipping(false);

      // Disable pickup
      if (isPickup) setIsPickup(false);

      // Only update delivery methods if the property exists
      if (deliveryMethodProperty?.id) {
        const deliveryValue = deliveryMethodProperty.options.find(
          (option) => option.value === "shipping_easy_pay",
        )?.id;

        if (!deliveryValue) return;

        // Add the shipping_prepaid delivery method required for Easy Pay
        updatePropertiesArray({
          value: deliveryValue,
          property: deliveryMethodProperty,
          field: propertiesField,
        });
      }
    } else {
      removeDeliveryMethodProperty();
    }
  }

  function handleManualShippingChange(
    value: boolean,
    propertiesField: AnyFieldApi,
    easyPay: boolean,
  ) {
    setIsManualShipping(value);

    if (!value) {
      form.setFieldValue("shipping_price", 0);
    }

    // Disable Easy Pay box UI & set easyPay to false
    if (easyPay && value) {
      form.setFieldValue("commons.easy_pay", false);
    }

    // Disable pickup box UI
    if (isPickup) setIsPickup(false);

    // if "delivery_method" property exists and "manual shipping" is enabled
    if (deliveryMethodProperty?.id) {
      removeDeliveryMethodProperty();

      // Only update delivery methods if the property exists
      if (deliveryMethodProperty?.id) {
        const deliveryValue = deliveryMethodProperty.options.find(
          (option) => option.value === "shipping",
        )?.id;

        if (!deliveryValue) return;

        // Add "shipping" to the properties array, use the field of properties to update the array
        updatePropertiesArray({
          value: deliveryValue,
          property: deliveryMethodProperty,
          field: propertiesField,
        });
      }
    }
  }

  return {
    form,
    isSubmittingForm,
    selectedSubCategory,
    isCityPopoverOpen,
    isPickup,
    isManualShipping,
    deliveryMethodProperty,
    setIsManualShipping,
    setIsPickup,
    setIsCityPopoverOpen,
    handleSubCategorySelect,
    handlePropertiesReset,
    handlePickupChange,
    handleEasyPayChange,
    handleManualShippingChange,
    removeDeliveryMethodProperty,
  };
}
