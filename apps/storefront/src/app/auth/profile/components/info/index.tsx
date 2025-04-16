"use client";

import { useState } from "react";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
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
import { useProfileData } from "@workspace/shared/hooks/use-profile-data";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Button } from "@workspace/ui/components/button";

import { useProfileInfoForm } from "./use-profile-info";
import { FieldInfo } from "#components/forms/utils/field-info";
import { Separator } from "@workspace/ui/components/separator";

export default function UserInfoComponent() {
  const [searchedCity, setSearchedCityName] = useState("");

  const { cities, isLoadingCities } = useCitiesData(searchedCity);
  const { profile, isLoadingProfile } = useProfileData();
  const { form, isCityPopoverOpen, setIsCityPopoverOpen, isSubmittingForm } =
    useProfileInfoForm({ ...profile, city: profile?.city?.id });

  return (
    <div className="flex flex-col w-full gap-8 px-4">
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
      <div className="flex flex-col mx-auto w-full xl:max-w-[50%]">
        {isLoadingProfile ? (
          <div className="flex flex-col gap-10 opacity-50">
            {[...Array(5).keys()].map((item, i) => (
              <div key={i} className="flex flex-col w-full gap-2">
                <Skeleton className="h-2 w-[80] bg-foreground" />
                <Skeleton className="h-4 w-full bg-foreground" />
              </div>
            ))}{" "}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 mb-4">
              <>
                <Label htmlFor={"username"} className="block">
                  Username
                </Label>
                <Input
                  id={"username"}
                  name={"username"}
                  disabled={true}
                  value={profile?.username}
                />
              </>

              <>
                <Label htmlFor={"email"} className="block">
                  Email
                </Label>
                <Input
                  id={"email"}
                  name={"email"}
                  disabled={true}
                  value={profile?.email}
                />
              </>
            </div>
            <Separator className="mt-4 mb-8" />
            <form
              className="w-full flex flex-col gap-8"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <div className="space-y-4">
                <form.Field name="fullname">
                  {(field) => {
                    const { name, state, handleChange } = field;
                    const { value } = state;

                    return (
                      <div className="space-y-2">
                        <Label htmlFor={name} className="block">
                          Full name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id={name}
                          name={name}
                          disabled={isLoadingProfile || isSubmittingForm}
                          onChange={(e) => handleChange(e.target.value)}
                          value={value}
                        />
                        <FieldInfo field={field} />
                      </div>
                    );
                  }}
                </form.Field>
                <form.Field name="gender">
                  {(field) => {
                    const { name, handleChange } = field;

                    return (
                      <>
                        <Label htmlFor={name}>
                          Gender <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          name={name}
                          disabled={isLoadingProfile || isSubmittingForm}
                          defaultValue={profile?.gender ?? ""}
                          onValueChange={(e: "male" | "female") => {
                            console.log(e);
                            handleChange(e);
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={`Select your gender`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {["male", "female"]?.map((item, i) => (
                                <SelectItem key={i} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldInfo field={field} />
                      </>
                    );
                  }}
                </form.Field>
                <form.Field name="city">
                  {(field) => {
                    const { name, state, handleChange, handleBlur } = field;
                    const { value, meta } = state;
                    const { isTouched, errors } = meta;
                    return (
                      <div className="space-y-2">
                        <Label htmlFor={field.name} className="block">
                          Item location <span className="text-red-500">*</span>
                        </Label>
                        <CitySelector
                          name={name}
                          value={value}
                          onChange={(e) => {
                            handleChange(e);
                          }}
                          onBlur={handleBlur}
                          isTouched={isTouched}
                          hasErrors={errors?.length > 0}
                          cities={
                            cities?.length
                              ? cities
                              : profile
                                ? [profile?.city]
                                : []
                          }
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

              <div className="w-full">
                <form.Subscribe
                  selector={(formState) => ({
                    canSubmit: formState.canSubmit,
                    isSubmitting: formState.isSubmitting,
                    isDirty: formState.isDirty,
                  })}
                >
                  {(state) => {
                    const { canSubmit, isSubmitting, isDirty } = state;
                    return (
                      <Button
                        type="submit"
                        disabled={isSubmitting || !isDirty || !canSubmit}
                        className="w-full"
                      >
                        {isSubmitting ? "..." : "Submit"}
                      </Button>
                    );
                  }}
                </form.Subscribe>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
