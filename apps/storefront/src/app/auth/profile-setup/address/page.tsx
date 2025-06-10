import { Suspense } from "react";
import ProfileSetupAddress from "./";

export default async function ProfileSetupAddressPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          Loading address setup...
        </div>
      }
    >
      <ProfileSetupAddress />
    </Suspense>
  );
}
