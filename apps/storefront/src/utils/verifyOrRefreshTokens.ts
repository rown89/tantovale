import { cookies } from "next/headers";

/**
 * Verifies the access token.
 * If verification fails, attempts to refresh the tokens.
 * Returns true if tokens are valid or successfully refreshed,
 * otherwise logs out the user and returns false.
 */

export async function verifyOrRefreshTokens({
  cookieHeader,
  accessToken,
  serverUrl,
}: {
  cookieHeader: string;
  accessToken: string | undefined;
  serverUrl: string;
}): Promise<boolean> {
  // Extract the access token from the cookie header.

  if (!accessToken) {
    console.error("No access token found in cookie header");
    return false;
  }

  // If token is still valid, verify it using the auth/verify endpoint.
  const verifyRequest = new Request(`${serverUrl}/auth/verify`, {
    method: "GET",
    headers: { Cookie: cookieHeader },
  });
  const verifyResponse = await fetch(verifyRequest);

  if (verifyResponse.ok) {
    const data = await verifyResponse.json();

    // Transform current date in milliseconds
    const now = Math.floor(Date.now() / 1000);

    // if the current date it's less then expiration date
    if (now < data?.user?.exp) {
      return true;
    } else {
      console.log("no");
      // If the token is expired or verification failed, attempt to refresh.
      const refreshRequest = new Request(`${serverUrl}/auth/refresh`, {
        method: "POST",
        headers: { Cookie: cookieHeader },
      });
      const refreshResponse = await fetch(refreshRequest);

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();

        const cookieStore = await cookies();
        cookieStore.set("access_token", data.access_token);
        cookieStore.set("refresh_token", data.refresh_token);
        return true;
      }
    }
  }

  return false;
}
