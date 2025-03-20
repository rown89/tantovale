import { cookies } from "next/headers";

// Logs out the user by calling the logout endpoint and clearing cookies.

export async function logoutAndClearCookies({
  cookieHeader,
  serverUrl,
}: {
  cookieHeader: string;
  serverUrl: string;
}) {
  try {
    const logoutRequest = new Request(`${serverUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { Cookie: cookieHeader },
    });

    await fetch(logoutRequest);

    const cookieStore = await cookies();
    cookieStore.delete("access_token");
    cookieStore.delete("refresh_token");
  } catch (error) {
    console.error("logoutAndClearCookies ", error);
  }
}
