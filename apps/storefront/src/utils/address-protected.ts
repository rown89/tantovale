import { NextRouter } from "next/router";

import { client } from "@workspace/server/client-rpc";

import { User } from "#providers/auth-providers";
import useTantovaleStore from "#stores";

interface AddressProtectedRouteParams {
  router: NextRouter;
  user: User | null;
  goTo: VoidFunction;
}

/**
 * Handles address verification for protected routes
 * Redirects users based on authentication and address status
 */

export default async function AddressProtectedRoute({
  router,
  user,
  goTo,
}: AddressProtectedRouteParams) {
  const { setAddressId, setIsAddressLoading } = useTantovaleStore();

  // Redirect unauthenticated users to login
  if (!user) {
    router.push("/login");
    return;
  }

  setIsAddressLoading(true);

  try {
    const hasAddressResponse =
      await client.profile.auth.user_has_address.$get();

    if (!hasAddressResponse.ok) {
      console.error("Failed to check user address:", hasAddressResponse.status);
      router.push("/login");
      return;
    }

    const { address_id } = await hasAddressResponse.json();

    if (address_id) {
      setAddressId(address_id);

      // User has an address, proceed to the desired route
      goTo();
    } else {
      // User doesn't have an address, redirect to address setup page
      router.push("/auth/profile-setup/address");
    }
  } catch (error) {
    // On error, redirect to address setup as a fallback
    router.push("/auth/profile-setup/address");
  } finally {
    setIsAddressLoading(false);
  }
}
