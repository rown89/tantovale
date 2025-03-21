import { client } from "#lib/api";
import { cookies } from "next/headers";

export async function logoutAndClearCookies({
  cookieHeader,
}: {
  cookieHeader: string;
}) {
  try {
    await client.auth.logout.$post({
      credentials: "include",
      headers: { Cookie: cookieHeader },
    });

    const cookieStore = await cookies();
    cookieStore.delete("access_token");
    cookieStore.delete("refresh_token");
  } catch (error) {
    console.error("logoutAndClearCookies ", error);
  }
}
