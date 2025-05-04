import { devtools } from "zustand/middleware";
import { create } from "zustand";
import { createChatSlice, ChatStore } from "./chat";

type TantovaleStoreProps = ChatStore;

const useTantovaleStore = create<TantovaleStoreProps>()(
  devtools((...a) => ({
    ...createChatSlice(...a),
  })),
);

export default useTantovaleStore;
