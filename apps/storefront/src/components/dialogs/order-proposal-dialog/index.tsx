"use client";

import { useEffect, useState } from "react";
import useProposalStore from "#stores/proposal-store";
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
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { FieldInfo } from "#components/forms/utils/field-info";

export function ProposalDialog() {
  const {
    originalItemPrice,
    proposalPrice,
    setProposalPrice,
    isProposalModalOpen,
    setIsProposalModalOpen,
    handleProposal,
    resetProposal,
  } = useProposalStore();
  const [itemId, setItemId] = useState<number | null>(null);

  // Assuming the item ID comes from URL or some other source
  // For example, we could extract it from the current URL
  useEffect(() => {
    if (isProposalModalOpen && typeof window !== "undefined") {
      const pathParts = window.location.pathname.split("/");
      const slug = pathParts[pathParts.length - 1];
      // This is just a placeholder - replace with actual logic to get item ID
      if (slug) {
        const id = parseInt(slug);
        if (!isNaN(id)) {
          setItemId(id);
        } else {
          setItemId(1); // Fallback ID
        }
      }
    }
  }, [isProposalModalOpen]);

  const form = useForm({
    defaultValues: {
      price: "",
    },
    onSubmit: async ({ value }) => {
      if (!itemId) return;

      try {
        const result = await handleProposal(itemId, Number(value.price));

        if (result) {
          // Success - close the modal
          setIsProposalModalOpen(false);
        }
      } catch (error) {
        console.error("Error submitting proposal:", error);
      }
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (isProposalModalOpen) {
      form.reset();
    }
  }, [isProposalModalOpen, form]);

  return (
    <Dialog
      open={isProposalModalOpen}
      onOpenChange={(value) => {
        setIsProposalModalOpen(value);
        if (!value) {
          form.reset();
          resetProposal();
        }
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Make a Price Proposal</DialogTitle>
          <DialogDescription>
            Original price: {originalItemPrice.toFixed(2)}
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
            <div className="grid grid-cols-1 items-center gap-4">
              <Label htmlFor="price">Your proposed price</Label>
              <div className="col-span-3">
                <form.Field
                  name="price"
                  validators={{
                    onChange: z
                      .string()
                      .refine(
                        (val) => !isNaN(Number(val)) && val !== "",
                        "Please enter a valid number",
                      )
                      .refine(
                        (val) => Number(val) > 0,
                        "Price must be greater than zero",
                      )
                      .refine(
                        (val) => Number(val) <= originalItemPrice,
                        `Price cannot exceed ${originalItemPrice.toFixed(2)}`,
                      ),
                  }}
                >
                  {(field) => (
                    <div>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={originalItemPrice}
                        placeholder={`Max: ${originalItemPrice.toFixed(2)}`}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldInfo field={field} />
                    </div>
                  )}
                </form.Field>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!form.state.canSubmit || originalItemPrice <= 0}
            >
              {form.state.isSubmitting ? "Submitting..." : "Submit Proposal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
