import { useState } from "react";
import { AlertCircle } from "lucide-react";

import { useLocationData } from "@workspace/shared/hooks/use-locations-data";
import { Label } from "@workspace/ui/components/label";

import { CitySelector } from "#components/city-selector";

export default function AddressForm() {
  const [searchedCityName, setSearchedCityName] = useState("");
  const [selectedCity, setSelectedCity] = useState<number>(0);
  const [isCityPopoverOpen, setIsCityPopoverOpen] = useState(false);

  const [searchedProvinceName, setSearchedProvinceName] = useState("");
  const [selectedProvince, setSelectedProvince] = useState<number>(0);
  const [isProvincePopoverOpen, setIsProvincePopoverOpen] = useState(false);

  const { cities, isLoadingLocations: isLoadingCities } = useLocationData(
    "city",
    searchedCityName,
  );
  const { provinces, isLoadingLocations: isLoadingProvinces } = useLocationData(
    "province",
    searchedProvinceName,
  );

  return (
    <div className="flex flex-col gap-4">
      <Label htmlFor="city">
        Your city <span className="text-red-500">*</span>
      </Label>
      <CitySelector
        name="city"
        value={selectedCity}
        onChange={(e) => {
          setSelectedCity(e);
        }}
        cities={cities}
        isLoadingCities={isLoadingCities}
        isSubmittingForm={isPending}
        onSearchChange={setSearchedCityName}
        isCityPopoverOpen={isCityPopoverOpen}
        setIsCityPopoverOpen={setIsCityPopoverOpen}
      />
      <input type="hidden" name="city" value={selectedCity} />
      {state.errors?.city && (
        <p className="text-sm text-red-500 flex items-center">
          <AlertCircle className="w-4 h-4 mr-1" />
          {state.errors.city}
        </p>
      )}
    </div>
  );
}
