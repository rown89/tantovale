import { AnyFieldApi, AnyFormApi } from "@tanstack/react-form";
import { z } from "zod";

import {
  createItemSchema,
  multipleImagesSchema,
} from "@workspace/server/extended_schemas";

import { PropertyFormValue, PropertyType } from "./types";

// Check if next button should be enabled based on form validation and required properties
export function isNextButtonEnabled({
  form,
  subCatProperties,
  properties,
}: {
  form: AnyFormApi;
  subCatProperties: PropertyType[] | undefined;
  properties: Omit<PropertyFormValue, "name">[] | undefined;
}) {
  // Validate step one
  const stepOneSchema = z.object({
    commons: createItemSchema.shape.commons,
    images: multipleImagesSchema,
  });

  const step_one_validation = stepOneSchema.safeParse(form.state.values);

  // Get required original subCatProperties length and exclude "delivery_method" but require "on_item_create_required"
  const requiredProperties =
    subCatProperties?.filter(
      (item) => item.slug !== "delivery_method" && item.on_item_create_required,
    ) || [];

  // Count how many required properties are satisfied in the form
  const satisfiedProperties = requiredProperties.filter((requiredProp) =>
    properties?.some((formProp) => formProp.slug === requiredProp.slug),
  ).length;

  const isMandatoryPropertiesSatisfied =
    satisfiedProperties === requiredProperties.length;

  return step_one_validation.success && isMandatoryPropertiesSatisfied;
}

// Update the properties array with proper types utility
export function updatePropertiesArray({
  value,
  property,
  field,
}: {
  value: PropertyFormValue["value"];
  property: NonNullable<PropertyType[]>[number];
  field: AnyFieldApi;
}) {
  // Ensure we have an array from the field state.
  const currentProperties: Omit<PropertyFormValue, "name">[] = Array.isArray(
    field.state.value,
  )
    ? [...field.state.value]
    : [];

  // Create the new property object.
  const newProperty = {
    id: property.id,
    slug: property.slug,
    value,
  };

  // Find if the property already exists.
  // Convert both IDs to strings for comparison to avoid type mismatches
  const existingIndex = currentProperties.findIndex(
    (prop) => String(prop.id) === String(property.id),
  );

  // Check if the value is an empty array
  if (Array.isArray(value) && value.length === 0) {
    // If property exists, remove it from the array
    if (existingIndex !== -1) {
      currentProperties.splice(existingIndex, 1);
    }
    // Don't add empty array properties
  } else {
    if (existingIndex !== -1) {
      // Update the existing property.
      currentProperties[existingIndex] = newProperty;
    } else {
      // Add a new property.
      currentProperties.push(newProperty);
    }
  }

  // Update the form field state.
  field.handleChange(currentProperties);
}

// set field default values utility
export function getCurrentValue(field: AnyFieldApi, filterId: string | number) {
  if (!Array.isArray(field.state.value)) return undefined;

  // Convert both IDs to strings for comparison
  const prop = field.state.value.find((p) => String(p.id) === String(filterId));

  const result = prop ? prop.value : undefined;

  return result;
}

export function handleItemPreviewProperties({
  properties,
  subCatProperties,
}: {
  properties: Omit<PropertyFormValue, "name">[];
  subCatProperties: PropertyType[] | undefined;
}) {
  // Handle condition selection
  const conditionProperty = properties.find(
    (item) => item.slug === "condition",
  );
  const selectedConditionId = conditionProperty?.value;

  let selectedCondition;

  if (selectedConditionId && subCatProperties) {
    const conditionFilter = subCatProperties.find(
      (item) => item.slug === "condition",
    );

    const extractedCondition = conditionFilter?.options.find(
      (item) => item.id === Number(selectedConditionId),
    );

    if (extractedCondition) {
      selectedCondition = {
        id: extractedCondition.id,
        name: extractedCondition.name,
        slug: String(extractedCondition.value),
      };
    }
  }

  // Handle delivery methods selection
  const deliveryProperty = properties.find(
    (item) => item.slug === "delivery_method",
  );
  const selectedDeliveryMethodsIds = deliveryProperty?.value;

  let selectedDeliveryMethods;

  if (selectedDeliveryMethodsIds && subCatProperties) {
    const deliveryMethodFilter = subCatProperties.find(
      (item) => item.slug === "delivery_method",
    );

    const extractedDeliveryMethods = deliveryMethodFilter?.options.find(
      (option) => option.id === Number(selectedDeliveryMethodsIds),
    );

    if (extractedDeliveryMethods) {
      selectedDeliveryMethods = {
        id: extractedDeliveryMethods.id,
        name: extractedDeliveryMethods.name,
        slug: String(extractedDeliveryMethods.value),
      };
    }
  }

  return { selectedCondition, selectedDeliveryMethods };
}
