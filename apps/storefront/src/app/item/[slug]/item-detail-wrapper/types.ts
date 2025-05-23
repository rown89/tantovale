import { OrderProposalStatus } from "@workspace/server/enumerated_values";

export interface ItemWrapperProps {
  item: {
    id: number;
    user: {
      id: number;
      username: string;
    };
    title: string;
    description: string;
    price: number;
    location: {
      city: {
        id: number;
        name: string;
      };
      province: {
        id: number;
        name: string;
      };
    };
    easy_pay: boolean;
    images: string[];
    subcategory: {
      name: string;
      slug: string;
    };
  };
  itemOwnerData: {
    id: number;
    phone_verified: boolean;
    email_verified: boolean;
    selling_items: number;
    location: {
      city: {
        id: number;
        name: string;
      };
      province: {
        id: number;
        name: string;
      };
    };
  };
  chatId?: number;
  orderProposal?: {
    id: number;
    created_at: string;
    status: OrderProposalStatus;
  };
  isFavorite: boolean;
}
