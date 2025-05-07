import { devtools } from "zustand/middleware";
import { create } from "zustand";
import { createChatSlice, ChatStore } from "./chat";
import { createItemDetailSlice, ItemDetailStore } from "./item-detail-store";
import { createProposalSlice, OrderProposalStore } from "./proposal-store";

type TantovaleStoreProps = ChatStore & ItemDetailStore & OrderProposalStore;

const useTantovaleStore = create<TantovaleStoreProps>()(
  devtools((...a) => ({
    ...createChatSlice(...a),
    ...createItemDetailSlice(...a),
    ...createProposalSlice(...a),
  })),
);

export default useTantovaleStore;
