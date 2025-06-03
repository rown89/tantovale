import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addAddressSchema } from "@workspace/server/extended_schemas";
import { client } from "@workspace/server/client-rpc";

type schemaType = z.infer<typeof addAddressSchema>;

export default function useAddressForm(onComplete: (e?: any) => void) {
  const [searchedCityName, setSearchedCityName] = useState("");
  const [selectedCity, setSelectedCity] = useState(0);
  const [isCityPopoverOpen, setIsCityPopoverOpen] = useState(false);

  const [searchedProvinceName, setSearchedProvinceName] = useState("");
  const [selectedProvince, setSelectedProvince] = useState(0);
  const [isProvincePopoverOpen, setIsProvincePopoverOpen] = useState(false);

  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: {
      address_id: 0,
      province_id: selectedProvince,
      city_id: selectedCity,
      street_address: "",
      civic_number: "",
      postal_code: 0,
      country_code: "IT",
      status: "inactive",
    },
    validators: {
      onSubmit: addAddressSchema,
    },
    onSubmit: async ({ value }: { value: schemaType }) => {
      updateAddress(value);
    },
  });

  const {
    mutate: updateAddress,
    isPending: isUpdatingAddress,
    error: updateAddressError,
  } = useMutation({
    mutationFn: async (value: schemaType) => {
      try {
        const response =
          await client.addresses.auth.update_address_to_profile.$put({
            json: value,
          });

        if (!response.ok) {
          throw new Error("Failed to update address");
        }

        queryClient.invalidateQueries({ queryKey: ["userAddress"] });

        return response.json();
      } catch (error) {
        throw error;
      } finally {
        onComplete();
      }
    },
  });

  const {
    mutate: deleteAddress,
    isPending: isDeletingAddress,
    error: deleteAddressError,
  } = useMutation({
    mutationFn: async ({ address_id }: { address_id: number }) => {
      try {
        const response =
          await client.addresses.auth.delete_address_to_profile.$put({
            json: { address_id },
          });

        if (!response.ok) {
          throw new Error("Failed to delete address");
        }

        queryClient.invalidateQueries({ queryKey: ["userAddress"] });

        return response.json();
      } catch (error) {
        throw error;
      } finally {
        onComplete();
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
    deleteAddress,
    onComplete,
    setSearchedProvinceName,
    setSelectedCity,
    setSelectedProvince,
    setSearchedCityName,
    setIsCityPopoverOpen,
    setIsProvincePopoverOpen,
  };
}
