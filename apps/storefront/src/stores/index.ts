import { devtools } from "zustand/middleware";
import { create } from "zustand";
import { createChatSlice, ChatStore } from "./chat";
import { createItemDetailSlice, ItemDetailStore } from "./item-detail-store";
import { createProposalSlice, OrderProposalStore } from "./proposal-store";
import { createNewItemSlice, NewItemStore } from "./item-new";

type TantovaleStoreProps = ChatStore &
  ItemDetailStore &
  OrderProposalStore &
  NewItemStore;

const useTantovaleStore = create<TantovaleStoreProps>()(
  devtools((...a) => ({
    ...createChatSlice(...a),
    ...createItemDetailSlice(...a),
    ...createProposalSlice(...a),
    ...createNewItemSlice(...a),
  })),
);

export default useTantovaleStore;
