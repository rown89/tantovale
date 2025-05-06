"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

import { Badge } from "@workspace/ui/components/badge";
import { ItemDetailCard } from "@workspace/ui/components/item-detail-card/index";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";

import { useAuth } from "#providers/auth-providers";
import { UserInfoBox } from "./components/user-info-box";
import { PaymentButton } from "./components/payment-button";
import { PaymentDialog } from "../../../../components/dialogs/pay-dialog";
import { ProposalDialog } from "../../../../components/dialogs/order-proposal-dialog";

import { useItemPayments } from "./hooks/use-item-payments";

import { ItemWrapperProps } from "./types";
import { ProposalButton } from "./components/proposal-button";

export default function ItemWDetailWrapper({
  item,
  itemOwnerData,
  chatId,
  orderProposal,
}: ItemWrapperProps) {
  const item_id = item.id;
  const { images } = item;

  console.log(orderProposal);

  const { user } = useAuth();
  const isMobile = useIsMobile();
  const router = useRouter();

  // Use null as initial state to match SSR
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  // Track if UserInfoBox is in view
  const [isInfoBoxInView, setIsInfoBoxInView] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const infoBoxRef = useRef<HTMLDivElement>(null);

  const {
    isBuyModalOpen,
    setIsBuyModalOpen,
    isProposalModalOpen,
    setIsProposalModalOpen,
    handlePayment,
    handleProposal,
  } = useItemPayments({
    item_id,
  });

  useEffect(() => {
    if (!infoBoxRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) {
          setIsInfoBoxInView(entries[0].isIntersecting);
        }
      },
      { threshold: 0.01 }, // Consider visible when 10% is in view
    );

    observer.observe(infoBoxRef.current);

    return () => {
      if (infoBoxRef.current) {
        observer.unobserve(infoBoxRef.current);
      }
    };
  }, []);

  return (
    <div className="container mx-auto px-4 xl:px-0 flex flex-col my-4">
      <div className="flex gap-8 xl:gap-12 w-full h-full flex-col xl:flex-row">
        {/* Item Card Detail  */}
        <ItemDetailCard
          imagesRef={fileInputRef}
          item={{
            ...item,
            images: images?.map((url, i) => (
              <Image
                key={i}
                onClick={() => {
                  setFullscreenImage(url);
                }}
                className="object-cover hover:cursor-pointer"
                fill
                src={url}
                alt=""
              />
            )),

            subcategory: item.subcategory && (
              <Link
                href={`/items/condition/${item.subcategory.slug ?? "#"}`}
                target="_blank"
                className="mb-2"
              >
                <Badge variant="outline" className="text-sm bg-accent px-3">
                  {item.subcategory.name}
                </Badge>
              </Link>
            ),
          }}
        />

        {isMobile && !isInfoBoxInView && item?.is_payable && (
          <div className="flex gap-2 justify-center items-center w-full fixed bottom-0 left-0 px-8 pb-4 ">
            {!orderProposal?.id && (
              <ProposalButton
                handleProposal={() => {
                  if (user) {
                    handlePayment.mutate(item.price);
                  } else {
                    router.push("/login");
                  }
                }}
              />
            )}

            <PaymentButton
              handlePayment={() => {
                if (user) {
                  handlePayment.mutate(item.price);
                } else {
                  router.push("/login");
                }
              }}
            />
            <div className="w-full bg-accent blur-xl h-[40px] fixed left-0 bottom-0 right-0 opacity-50" />
          </div>
        )}

        {/* Right sidebar */}
        {
          <UserInfoBox
            ref={infoBoxRef}
            item={item}
            itemOwnerData={itemOwnerData}
            chatId={chatId}
            orderProposal={orderProposal}
          />
        }
      </div>

      <PaymentDialog
        isBuyModalOpen={isBuyModalOpen}
        setIsBuyModalOpen={setIsBuyModalOpen}
      />

      <ProposalDialog
        isProposalModalOpen={isProposalModalOpen}
        setIsProposalModalOpen={setIsProposalModalOpen}
      />

      {/* image Fullscreen Preview (doesn't work on initial placeholder images) */}
      {
        <AnimatePresence>
          {fullscreenImage && (
            <motion.div
              className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFullscreenImage(null)}
            >
              <motion.img
                src={fullscreenImage}
                alt="Fullscreen"
                className="h-full p-12 object-contain"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      }
    </div>
  );
}
