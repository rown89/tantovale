import { devtools } from "zustand/middleware";
import { create } from "zustand";
import { createChatSlice, ChatStore } from "./chat";
import { createItemDetailSlice, ItemDetailStore } from "./item-detail-store";

type TantovaleStoreProps = ChatStore & ItemDetailStore;

const useTantovaleStore = create<TantovaleStoreProps>()(
  devtools((...a) => ({
    ...createChatSlice(...a),
    ...createItemDetailSlice(...a),
  })),
);

export default useTantovaleStore;
