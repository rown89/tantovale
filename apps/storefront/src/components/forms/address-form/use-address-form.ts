import { useState } from "react";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addAddressSchema } from "@workspace/server/extended_schemas";
import { client } from "@workspace/server/client-rpc";

const addSchema = addAddressSchema.omit({ address_id: true }).extend({
  mode: z.literal("add"),
});

const editSchema = addAddressSchema.extend({
  mode: z.literal("edit"),
});

const schema = z.union([addSchema, editSchema]);

type schemaType = z.infer<typeof schema>;

export default function useAddressForm(
  onComplete?: (e?: { id: number }) => void,
) {
  const [searchedCityName, setSearchedCityName] = useState("");
  const [selectedCity, setSelectedCity] = useState(0);
  const [isCityPopoverOpen, setIsCityPopoverOpen] = useState(false);

  const [searchedProvinceName, setSearchedProvinceName] = useState("");
  const [selectedProvince, setSelectedProvince] = useState(0);
  const [isProvincePopoverOpen, setIsProvincePopoverOpen] = useState(false);

  const [addAddressStates, setAddAddressStates] = useState<boolean>(false);
  const [editAddressStates, setEditAddressStates] = useState<
    Record<number, boolean>
  >({});
  const [deleteAddressStates, setDeleteAddressStates] = useState<
    Record<number, boolean>
  >({});

  const toggleEditAddress = (addressId: number) => {
    setEditAddressStates((prev) => ({
      ...prev,
      [addressId]: !prev[addressId],
    }));
  };

  const toggleDeleteAddress = (addressId: number) => {
    setDeleteAddressStates((prev) => ({
      ...prev,
      [addressId]: !prev[addressId],
    }));
  };

  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: {
      address_id: 0,
      label: "",
      province_id: 0,
      city_id: 0,
      street_address: "",
      civic_number: "",
      postal_code: 0,
      country_code: "IT",
      phone: "",
      status: "inactive",
      mode: "edit" as "add" | "edit",
    },
    validators: {
      onSubmit: schema,
    },
    onSubmit: async ({ value }: { value: schemaType }) => {
      if (value.mode === "add") {
        const { mode, ...rest } = value;
        addAddress(rest);
      } else {
        const { mode, ...rest } = value;
        updateAddress(rest);
      }
    },
  });

  function invalidateAddresses() {
    queryClient.invalidateQueries({ queryKey: ["userAddress"] });
  }

  const {
    mutate: addAddress,
    isPending: isAddingAddress,
    error: addAddressError,
    isSuccess: isAddingAddressSuccess,
  } = useMutation({
    mutationFn: async (value: Omit<z.infer<typeof addSchema>, "mode">) => {
      const response = await client.addresses.auth.add_address_to_profile.$post(
        {
          json: value,
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to add address: ${response.status} ${response.statusText}`,
        );
      }

      return response.json();
    },
    onError: (error) => {
      console.error("AddAddress mutation error:", error);
    },
    onSuccess: (data) => {
      console.log("AddAddress mutation success:", data);
      invalidateAddresses();

      if (onComplete) onComplete();
    },
  });

  const {
    mutate: updateAddress,
    isPending: isUpdatingAddress,
    error: updateAddressError,
    isSuccess: isUpdatingAddressSuccess,
  } = useMutation({
    mutationFn: async (value: Omit<z.infer<typeof editSchema>, "mode">) => {
      const response =
        await client.addresses.auth.update_address_to_profile.$put({
          json: value,
        });

      if (!response.ok) throw new Error("Failed to update address");

      return response.json();
    },
    onError: (error, variables) => {
      console.error("UpdateAddress mutation error:", error);
    },
    onSuccess: (data, variables) => {
      console.log("UpdateAddress mutation success:", data);
      invalidateAddresses();

      if (onComplete) onComplete();
    },
  });

  const {
    mutate: deleteAddress,
    isPending: isDeletingAddress,
    error: deleteAddressError,
    isSuccess: isDeletingAddressSuccess,
  } = useMutation({
    mutationFn: async ({ address_id }: { address_id: number }) => {
      const response =
        await client.addresses.auth.hide_address_from_profile.$put({
          json: { address_id },
        });

      if (!response.ok) throw new Error("Failed to delete address");

      return response.json();
    },
    onSettled: (data, error, variables) => {
      invalidateAddresses();

      if (variables.address_id) {
        toggleDeleteAddress(variables.address_id);
      }
    },
  });

  return {
    form,
    searchedCityName,
    searchedProvinceName,
    selectedCity,
    selectedProvince,
    isCityPopoverOpen,
    isProvincePopoverOpen,
    isUpdatingAddress,
    updateAddressError,
    isDeletingAddress,
    deleteAddressError,
    addAddressError,
    isAddingAddress,
    deleteAddress,
    addAddressStates,
    editAddressStates,
    deleteAddressStates,
    isAddingAddressSuccess,
    isUpdatingAddressSuccess,
    isDeletingAddressSuccess,
    setAddAddressStates,
    setEditAddressStates,
    setDeleteAddressStates,
    toggleEditAddress,
    toggleDeleteAddress,
    onComplete,
    setSearchedProvinceName,
    setSelectedCity,
    setSelectedProvince,
    setSearchedCityName,
    setIsCityPopoverOpen,
    setIsProvincePopoverOpen,
  };
}
