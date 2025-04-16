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
    city: string;
    is_payable: boolean;
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
    city: {
      id: number;
      name: string;
    };
  };
}
