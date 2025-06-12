"use client";

import AddressForm from "#components/forms/address-form";
import { Label } from "@workspace/ui/components/label";
import Image from "next/image";

export default function ProfileSetupAddress() {
  return (
    <div className="container mx-auto px-6 lg:px-2 xl:px-0 h-[calc(100vh-73px)]">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-14 h-full">
        <div className="hidden xl:block relative h-full w-full">
          <Image
            src="/heart-bg.png"
            alt="Address"
            fill
            className="object-cover"
          />
        </div>
        <div className="flex flex-col gap-4 py-6">
          <h1 className="text-2xl font-bold">Add Address</h1>
          <Label className="text-sm text-muted-foreground">
            Add an address to your profile to start selling.
          </Label>
          <AddressForm mode="add" firstAddress />
        </div>
      </div>
    </div>
  );
}
