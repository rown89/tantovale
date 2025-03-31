import { useState } from "react";
import { useRouter } from "next/navigation";
import { QueryObserverResult } from "@tanstack/react-query";
import { client } from "@workspace/shared/clients/rpc-client";
import { Item } from "../index";

export function useSellingItems(refetch: () => Promise<QueryObserverResult>) {
  const router = useRouter();
  const [shareItem, setShareItem] = useState<Item | null>(null);

  const handleDelete = async (id: number) => {
    const deleteResponse = await client.auth.item.user_delete_item.$post({
      json: {
        id,
      },
    });

    if (!deleteResponse.ok) {
      return false;
    } else {
      await refetch();
      return true;
    }
  };

  const handlePublish = async (id: number, published: boolean) => {
    const publishResponse = await client.auth.item.publish_state.$post({
      json: {
        id,
        published,
      },
    });

    if (!publishResponse.ok) {
      return false;
    } else {
      await refetch();
      return true;
    }
  };

  const handleEdit = (id: number) => {
    router.push(`/auth/item/edit/${id}`);
  };

  return {
    shareItem,
    setShareItem,
    handleDelete,
    handleEdit,
    handlePublish,
  };
}
