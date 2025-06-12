import { Suspense } from "react";

import { Spinner } from "@workspace/ui/components/spinner";

import ProfileSetupAddress from "./";

export default async function ProfileSetupAddressPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-6 px-6 lg:px-2 xl:px-0 h-[calc(100vh-56px)]">
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        </div>
      }
    >
      <ProfileSetupAddress />
    </Suspense>
  );
}
