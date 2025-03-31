import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  createItemSchema,
  multipleImagesSchema,
} from "@workspace/server/schema";

const schema = createItemSchema.and(z.object({ images: multipleImagesSchema }));
type schemaType = z.infer<typeof schema>;

export function useCreateItemForm() {
  const [isCityPopoverOpen, setIsCityPopoverOpen] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Initialize form
  const form = useForm({
    ...formOpts.defaultValues,
    validators: {
      onSubmit: () => {},
    },
    onSubmit: async ({ value }) => {
      setIsSubmittingForm(true);

      try {
        toast(`Success!`, {
          description: "Profile edited correctly!",
          duration: 4000,
        });
      } catch (error) {
        toast(`Error :(`, {
          description:
            "We are encountering technical problems, please retry later.",
          duration: 4000,
        });
      } finally {
        setIsSubmittingForm(false);
      }
    },
  });

  return {
    form,
    isSubmittingForm,
    isCityPopoverOpen,
    setIsCityPopoverOpen,
  };
}
