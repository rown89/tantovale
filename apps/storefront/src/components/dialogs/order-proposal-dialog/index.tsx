"use client";

import { z } from "zod";
import { useEffect, useState } from "react";
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

export function ProposalDialog() {
  const {
    setChatId,
    item,
    originalItemPrice,
    isProposalModalOpen,
    setIsProposalModalOpen,
    handleProposal,
  } = useTantovaleStore();

  // State for validation errors
  const [validationError, setValidationError] = useState<string | null>(null);

  // Define the schema for our form
  const formSchema = z.object({
    price: z.coerce
      .number({
        invalid_type_error: "Please enter a valid number",
        required_error: "Price is required",
      })
      .min(0.01, "Price must be greater than zero")
      .max(
        originalItemPrice,
        `Price cannot exceed ${originalItemPrice.toFixed(2)}`,
      ),
    message: z.string().optional(),
  });

  const form = useForm({
    defaultValues: {
      price: originalItemPrice ?? 0,
      message: "",
    },
    onSubmit: async ({ value }) => {
      if (!item) return;

      try {
        // Validate with our Zod schema
        formSchema.parse(value);

        console.log("Submitting values:", value);

        const result = await handleProposal(
          item.id,
          // Convert to cents
          Number(value.price) * 100,
          value.message,
        );

        if (result) {
          setIsProposalModalOpen(false);
          setChatId(result.chatRoomId);
        }
      } catch (error) {
        console.error("Error during submission:", error);
        if (error instanceof z.ZodError) {
          // Get the first error message for display
          setValidationError(error.errors[0]?.message || "Invalid form data");
        } else {
          setValidationError("Failed to submit proposal. Please try again.");
        }
      }
    },
  });

  // Reset form when dialog opens or originalItemPrice changes
  useEffect(() => {
    if (isProposalModalOpen) {
      form.reset({
        price: originalItemPrice ?? 0,
        message: "",
      });
      setValidationError(null);
    }
  }, [isProposalModalOpen, originalItemPrice, form]);

  return (
    <Dialog
      open={isProposalModalOpen}
      onOpenChange={(value) => {
        setIsProposalModalOpen(value);
        if (!value) {
          form.reset();
          setValidationError(null);
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

            try {
              // Validate before submitting
              formSchema.parse(form.state.values);
              setValidationError(null);
              form.handleSubmit();
            } catch (error) {
              if (error instanceof z.ZodError) {
                setValidationError(
                  error.errors[0]?.message || "Invalid form data",
                );
              } else {
                setValidationError(
                  "Form validation failed. Please check your input.",
                );
              }
              console.error("Form validation error:", error);
            }
          }}
          className="space-y-4"
        >
          {validationError && (
            <div className="bg-red-50 p-3 rounded-md border border-red-200">
              <p className="text-red-600 text-sm">{validationError}</p>
            </div>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 items-center gap-5">
              <Label htmlFor="price">Your proposed price</Label>
              <div className="col-span-3">
                <form.Field name="price">
                  {(field) => (
                    <div>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={originalItemPrice}
                        placeholder={`Max: ${originalItemPrice.toFixed(2)}`}
                        value={field.state.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.handleChange(value === "" ? 0 : Number(value));
                        }}
                      />
                      <FieldInfo field={field} />
                    </div>
                  )}
                </form.Field>
              </div>
              <Label htmlFor="message">Optional message</Label>
              <div className="col-span-3">
                <form.Field name="message">
                  {(field) => (
                    <>
                      <Textarea
                        id="message"
                        name="message"
                        rows={4}
                        placeholder={`Write a message to the user`}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldInfo field={field} />
                    </>
                  )}
                </form.Field>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={originalItemPrice <= 0}>
              {form.state.isSubmitting ? "Submitting..." : "Submit Proposal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
