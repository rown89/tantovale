import { AuthTokens } from "#shared/auth-tokens";
import { OrderProposalStatus } from "@workspace/server/enumerated_values";

export interface ItemDetailPageParams {
  id: string;
  authTokens: AuthTokens;
}

// Core data interfaces
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

// Main data interface for the page
export interface ItemDetailData {
  item: Item;
  itemOwnerData: ItemOwnerData;
  chatId?: number;
  orderProposal?: OrderProposal;
  isFavorite: boolean;
  isCurrentUserTheItemOwner: boolean;
}

// Re-export existing types for backward compatibility
export interface ItemWrapperProps extends ItemDetailData {}

// Error handling types
export interface FetchError {
  message: string;
  status?: number;
  code?: string;
}

export interface AuthHeaders {
  cookie: string;
}
