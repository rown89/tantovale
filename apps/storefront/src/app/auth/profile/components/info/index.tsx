"use client";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { FieldInfo } from "#components/forms/utils/field-info";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@workspace/ui/components/select";
import { CitySelector } from "#components/forms/commons/city-selector";
import { useCitiesData } from "@workspace/shared/hooks/use-cities-data";
import { useProfileInfoForm } from "./use-profile-info";
import { useState } from "react";

export default function ProfileInfoComponent() {
  const [searchedCity, setSearchedCityName] = useState("");
  const { form, isCityPopoverOpen, setIsCityPopoverOpen, isSubmittingForm } =
    useProfileInfoForm();
  const { cities, isLoadingCities } = useCitiesData(searchedCity);

  return (
    <div className="flex flec-col w-full justify-center">
      <form
        className="w-full"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div className="space-y-4">
          <form.Field name="fullname">
            {(field) => {
              const { name, state } = field;
              const { value } = state;

              return (
                <div className="space-y-2">
                  <Label htmlFor={name} className="block">
                    Full name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id={name}
                    name={name}
                    disabled={true}
                    value={value !== undefined ? value?.toString() : ""}
                  />
                </div>
              );
            }}
          </form.Field>

          <form.Field name="gender">
            {(field) => {
              const { name, state } = field;

              return (
                <>
                  <Label htmlFor={name} className="block">
                    Gender <span className="text-red-500">*</span>
                  </Label>
                  <Select name={name} defaultValue={""}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={`Select your gender`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="reset">--</SelectItem>
                        {["male", "female"]?.map((item, i) => (
                          <SelectItem key={i} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </>
              );
            }}
          </form.Field>

          <form.Field name="city">
            {(field) => {
              const { name, state, setValue, handleBlur } = field;
              const { value, meta } = state;
              const { isTouched, errors } = meta;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name} className="block">
                    Item location <span className="text-red-500">*</span>
                  </Label>
                  <CitySelector
                    value={Number(field.state.value)}
                    onChange={(e) => setValue(e)}
                    onBlur={handleBlur}
                    name={name}
                    isTouched={isTouched}
                    hasErrors={errors?.length > 0}
                    cities={cities}
                    isLoadingCities={isLoadingCities}
                    isSubmittingForm={isSubmittingForm}
                    onSearchChange={setSearchedCityName}
                    isCityPopoverOpen={isCityPopoverOpen}
                    setIsCityPopoverOpen={setIsCityPopoverOpen}
                  />
                  <FieldInfo field={field} />
                </div>
              );
            }}
          </form.Field>
        </div>
      </form>
    </div>
  );
}
