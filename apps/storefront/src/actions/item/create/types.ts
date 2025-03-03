import { createItemTypes } from "../../../../../server/src/routes";

export type ItemFormData = createItemTypes;

export interface ItemActionResponse {
  success: boolean;
  message: string;
  inputs?: ItemFormData;
  errors?: {
    [K in keyof ItemFormData]?: string[];
  };
}
