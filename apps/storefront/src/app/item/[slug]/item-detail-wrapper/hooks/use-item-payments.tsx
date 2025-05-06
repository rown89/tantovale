import { useMutation } from "@tanstack/react-query";

import { client } from "@workspace/server/client-rpc";
import { useState } from "react";

interface useItemPaymentsProps {
  item_id: number;
}

export function useItemPayments({ item_id }: useItemPaymentsProps) {
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);

  const handlePayment = useMutation({
    mutationFn: async (price: number) => {
      const response = await client.orders_proposals.auth.create.$post({
        json: {
          item_id,
          price,
        },
      });

      if (!response.ok) return false;

      return await response.json();
    },
    onSuccess: (value) => {
      console.log("success", value);
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
    },
  });

  const handleProposal = useMutation({
    mutationFn: async (price: number) => {
      const response = await client.orders_proposals.auth.create.$post({
        json: {
          item_id,
          price,
        },
      });

      if (!response.ok) return false;

      return await response.json();
    },
  });

  return {
    isBuyModalOpen,
    setIsBuyModalOpen,
    isProposalModalOpen,
    setIsProposalModalOpen,
    handlePayment,
    handleProposal,
  };
}
