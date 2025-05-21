import { StateCreator } from "zustand";
import type { PropertyType } from "#components/forms/handle-item-form/utils";

export type NewItemStore = {
  step: number;
  setStep: (step: number) => void;
  images: File[];
  setImages: (images: File[]) => void;
  commons: {
    title: string;
    easy_pay: boolean;
    description: string;
    price: number;
    shipping_price: number;
    subcategory_id: number;
    city: number;
  };
  setCommons: (commons: {
    title?: string;
    easy_pay?: boolean;
    description?: string;
    price?: number;
    shipping_price?: number;
    subcategory_id?: number;
    city?: number;
  }) => void;
  properties: PropertyType[];
  setProperties: (properties: PropertyType[]) => void;
};

export const createNewItemSlice: StateCreator<NewItemStore> = (set) => ({
  step: 0,
  setStep: (step: number) => set({ step }),
  images: [],
  setImages: (images: File[]) => set({ images }),
  commons: {
    title: "",
    easy_pay: false,
    description: "",
    price: 0,
    shipping_price: 0,
    subcategory_id: 0,
    city: 0,
  },
  setCommons: (commons?: {
    title?: string;
    easy_pay?: boolean;
    description?: string;
    price?: number;
    shipping_price?: number;
    subcategory_id?: number;
    city?: number;
  }) =>
    set({
      commons: {
        ...commons,
        title: commons?.title ?? "",
        easy_pay: commons?.easy_pay ?? false,
        description: commons?.description ?? "",
        price: commons?.price ?? 0,
        shipping_price: commons?.shipping_price ?? 0,
        subcategory_id: commons?.subcategory_id ?? 0,
        city: commons?.city ?? 0,
      },
    }),
  properties: [],
  setProperties: (properties: PropertyType[]) => set({ properties }),
});
