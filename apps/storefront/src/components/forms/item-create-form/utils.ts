import { AnyFieldApi, formOptions } from "@tanstack/react-form";

export interface PropertyType {
  id: number;
  name: string;
  on_item_create_required: boolean;
  options: {
    id: number;
    name: string;
    value: any;
  }[];
  slug: string;
  type: string;
}

export const delivery_method_types = [
  { id: "pickup", name: "Pickup" },
  { id: "shipping", name: "Shipping" },
];

export const formOpts = formOptions({
  defaultValues: {
    images: [],
    commons: {
      title: "",
      is_payable: false,
      description: "",
      price: 0,
      delivery_method: "shipping",
      subcategory_id: 0,
      city: 0,
    },
    properties: [],
  },
});

// Update the properties array with proper types utility
export function updatePropertiesArray({
  value,
  property,
  field,
}: {
  value: string | number | boolean | (string | number)[];
  property: NonNullable<PropertyType[]>[number];
  field: AnyFieldApi;
}) {
  // Ensure we have an array from the field state.
  const currentProperties: {
    id: number;
    slug: string;
    value: unknown;
  }[] = Array.isArray(field.state.value) ? [...field.state.value] : [];

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
