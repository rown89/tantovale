import { AuthTokens } from "#shared/auth-tokens";
import { cookies } from "next/headers";

// Utility function to get auth tokens
export async function getAuthTokens(): Promise<AuthTokens> {
  const cookieStore = await cookies();
  return {
    accessToken: cookieStore.get("access_token")?.value,
    refreshToken: cookieStore.get("refresh_token")?.value,
  };
}
