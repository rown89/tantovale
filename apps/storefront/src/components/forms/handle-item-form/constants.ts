import { formOptions } from "@tanstack/react-form";

// Progress steps
export const step_one = 50;
export const step_two = 100;

// max upload images
export const maxImages = 5;

export const formOpts = formOptions({
  defaultValues: {
    images: [],
    commons: {
      title: "",
      easy_pay: false,
      description: "",
      price: 0,
      shipping_price: 0,
      subcategory_id: 0,
      city: 0,
    },
    properties: [],
    shipping_price: 0,
  },
});
