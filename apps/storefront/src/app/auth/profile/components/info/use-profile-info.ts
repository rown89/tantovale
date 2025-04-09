import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { UserSchema } from "@workspace/server/extended_schemas";
import { client } from "@workspace/shared/clients/rpc-client";

const schema = UserSchema.pick({
  fullname: true,
  gender: true,
  city: true,
});
type schemaType = z.infer<typeof schema>;

export function useProfileInfoForm(profiles?: Partial<schemaType>) {
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isCityPopoverOpen, setIsCityPopoverOpen] = useState(false);

  // Initialize form
  const form = useForm({
    defaultValues: {
      fullname: profiles?.fullname ?? "",
      gender: profiles?.gender ?? "male",
      city: profiles?.city ?? 0,
    },
    validators: {
      onSubmit: schema,
    },
    onSubmit: async ({ value }: { value: schemaType }) => {
      setIsSubmittingForm(true);

      try {
        const response = await client.profile.auth.$put({ json: value });

        if (!response.ok) {
          throw new Error("update profile error");
        }

        return toast(`Success!`, {
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
    isCityPopoverOpen,
    setIsCityPopoverOpen,
    isSubmittingForm,
  };
}
