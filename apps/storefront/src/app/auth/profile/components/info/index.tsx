"use client";

import { useState } from "react";
import Link from "next/link";

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
import { useLocationData } from "@workspace/shared/hooks/use-locations-data";
import { useProfileData } from "@workspace/shared/hooks/use-profile-data";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Button } from "@workspace/ui/components/button";
import { useProfileInfoForm } from "./use-profile-info";
import { Separator } from "@workspace/ui/components/separator";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card";

import { FieldInfo } from "#components/forms/utils/field-info";
import { CitySelector } from "#components/city-selector";

export default function UserInfoComponent() {
  const [searchedCity, setSearchedCityName] = useState("");
  const [searchedProvince, setSearchedProvinceName] = useState("");

  const { cities, isLoadingLocations: isLoadingCities } = useLocationData(
    "city",
    searchedCity,
  );

  const { provinces, isLoadingLocations: isLoadingProvinces } = useLocationData(
    "province",
    searchedProvince,
  );

  const { profile, isLoadingProfile, isPaymentProviderConnected } =
    useProfileData();

  const {
    profileForm,
    isCityPopoverOpen,
    setIsCityPopoverOpen,
    isSubmittingProfileForm,
  } = useProfileInfoForm({ ...profile });

  return (
    <div className="flex flex-col w-full gap-8 px-4">
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
      <div className="flex flex-col mx-auto w-full">
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
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Account information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
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
                  <form
                    className="w-full flex flex-col gap-8"
                    onSubmit={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      profileForm.handleSubmit();
                    }}
                  >
                    <profileForm.Field name="name">
                      {(field) => {
                        const { name, state, handleChange } = field;
                        const { value } = state;

                        return (
                          <div className="space-y-2">
                            <Label htmlFor={name} className="block">
                              Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id={name}
                              name={name}
                              disabled={
                                isLoadingProfile || isSubmittingProfileForm
                              }
                              onChange={(e) => handleChange(e.target.value)}
                              value={value}
                            />
                            <FieldInfo field={field} />
                          </div>
                        );
                      }}
                    </profileForm.Field>
                    <profileForm.Field name="surname">
                      {(field) => {
                        const { name, state, handleChange } = field;
                        const { value } = state;

                        return (
                          <div className="space-y-2">
                            <Label htmlFor={name} className="block">
                              Surname <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id={name}
                              name={name}
                              disabled={
                                isLoadingProfile || isSubmittingProfileForm
                              }
                              onChange={(e) => handleChange(e.target.value)}
                              value={value}
                            />
                            <FieldInfo field={field} />
                          </div>
                        );
                      }}
                    </profileForm.Field>
                    <profileForm.Field name="gender">
                      {(field) => {
                        const { name, handleChange } = field;

                        return (
                          <>
                            <Label htmlFor={name}>
                              Gender <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              name={name}
                              disabled={
                                isLoadingProfile || isSubmittingProfileForm
                              }
                              defaultValue={profile?.gender ?? ""}
                              onValueChange={(e: "male" | "female") => {
                                console.log(e);
                                handleChange(e);
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue
                                  placeholder={`Select your gender`}
                                />
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
                    </profileForm.Field>

                    <div className="w-full">
                      <profileForm.Subscribe
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
                      </profileForm.Subscribe>
                    </div>
                  </form>

                  {/* TODO: add address form */}
                  {/* <form.Field name="city">
                        {(field) => {
                          const { name, state, handleChange, handleBlur } =
                            field;
                          const { value, meta } = state;
                          const { isTouched, errors } = meta;
                          return (
                            <div className="space-y-2">
                              <Label htmlFor={field.name} className="block">
                                Item location{" "}
                                <span className="text-red-500">*</span>
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
                  */}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment provider</CardTitle>
                <CardDescription className="flex flex-col md:flex-row gap-2 justify-between">
                  {!isPaymentProviderConnected ? (
                    <span>
                      Connect a{" "}
                      <Link href="#" target="_blank" className="text-blue-500">
                        payment provider
                      </Link>{" "}
                      account to start selling and accepting payments.
                    </span>
                  ) : (
                    "Stripe account connected"
                  )}

                  {!isPaymentProviderConnected && (
                    <Button className="w-full max-w-full md:max-w-fit">
                      Connect Stripe
                    </Button>
                  )}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Phone validation</CardTitle>
                <CardDescription className="flex flex-col md:flex-row gap-2 justify-between">
                  <span>
                    Secure your account by verifying your phone number.
                  </span>
                  <Button className="w-full max-w-full md:max-w-fit">
                    Verify phone number
                  </Button>
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
