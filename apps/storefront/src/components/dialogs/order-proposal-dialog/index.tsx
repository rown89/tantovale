"use client";

import { z } from "zod";
import { useForm } from "@tanstack/react-form";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";

import { FieldInfo } from "#components/forms/utils/field-info";
import useTantovaleStore from "#stores";
import { formatPrice, formatPriceToCents } from "@workspace/ui/lib/utils";
import { create_order_proposal_schema } from "node_modules/@workspace/server/src/extended_schemas/order_proposals";
import { toast } from "sonner";

export function ProposalDialog() {
  const {
    setChatId,
    item,
    isProposalModalOpen,
    setIsProposalModalOpen,
    handleProposal,
  } = useTantovaleStore();

  const formSchema = item
    ? create_order_proposal_schema.extend({
        proposal_price: z
          .number()
          .min(0.01)
          .max(formatPrice(item.price - 1)),
      })
    : create_order_proposal_schema;

  const form = useForm({
    defaultValues: {
      item_id: item?.id ?? 0,
      proposal_price: item ? formatPrice(item.price - 1) : 0,
      message: "Hello, I would like to buy your item, can you make it cheaper?",
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      if (!item) return;

      const item_id = value.item_id;
      const proposal_price = formatPriceToCents(value.proposal_price);
      const message = value.message;

      try {
        const result = await handleProposal({
          item_id,
          proposal_price,
          message,
        });

        if (result) {
          setIsProposalModalOpen(false);
          setChatId(result.chat_room_id);

          toast.success("Proposal sent successfully");
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          toast.error(error.errors[0]?.message || "Invalid form data");
        } else {
          toast.error("Failed to submit proposal. Please try again.");
        }
      }
    },
  });

  if (!item) return null;

  return (
    <Dialog
      open={isProposalModalOpen}
      onOpenChange={(value) => {
        setIsProposalModalOpen(value);
        if (!value) form.reset();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Make a Price Proposal</DialogTitle>
          <DialogDescription className="flex flex-col gap-2">
            <span>Current item price: {formatPrice(item?.price)}€</span>
            <i className="text-sm text-orange-400">
              If the seller does not accept or reject the proposal, it will
              automatically expire after 7 days.
            </i>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();

            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 items-center gap-5">
              <Label htmlFor="price">Your proposed price</Label>
              <div className="col-span-3">
                <form.Field name="proposal_price">
                  {(field) => {
                    const { name, handleBlur, handleChange, state } = field;
                    const { value } = state;

                    return (
                      <div>
                        <Input
                          id={name}
                          name={name}
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={formatPrice(item.price)}
                          placeholder={`Max: ${formatPrice(item.price)}`}
                          value={field.state.value}
                          onChange={(e) => {
                            const value = e.target.value;

                            field.handleChange(
                              value === "" ? 0 : Number(value),
                            );
                          }}
                        />
                        <FieldInfo field={field} />
                      </div>
                    );
                  }}
                </form.Field>
              </div>
              <Label htmlFor="message">Message</Label>
              <div className="col-span-3">
                <form.Field name="message">
                  {(field) => {
                    const { name, handleBlur, handleChange, state } = field;
                    const { value } = state;

                    return (
                      <>
                        <Textarea
                          name={name}
                          rows={4}
                          placeholder={`Write a message to the user`}
                          value={value !== undefined ? value?.toString() : ""}
                          onChange={(e) => handleChange(e.target.value)}
                          onBlur={handleBlur}
                        />
                        <FieldInfo field={field} />
                      </>
                    );
                  }}
                </form.Field>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={item.price <= 0}>
              {form.state.isSubmitting ? "Submitting..." : "Submit Proposal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
