"use server";

import { cookies } from "next/headers";
import { client } from "@/lib/api";

export async function getServerAuth() {
  // Read the access token from Next.js cookies
  const cookieReader = await cookies();
  const accessToken = cookieReader.get("access_token")?.value;

  if (!accessToken) return null;

  // Forward the access token cookie to backend
  const response = await client?.auth.me.$get({
    credentials: "include",
    headers: {
      Cookie: `access_token=${accessToken}`,
    },
  });

  if (response?.status !== 200) return null;

  const data = await response.json();

  return data.user;
}
