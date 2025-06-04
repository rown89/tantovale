import { OrderProposalStatus } from "@workspace/server/enumerated_values";

interface Item {
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
}

interface ItemOwnerData {
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
}

interface OrderProposal {
  id: number;
  created_at: string;
  status: OrderProposalStatus;
}

export interface ItemWrapperProps {
  item: Item;
  itemOwnerData: ItemOwnerData;
  chatId?: number;
  orderProposal?: OrderProposal;
  isFavorite: boolean;
  isCurrentUserTheItemOwner: boolean;
}
