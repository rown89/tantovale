// src/utils/getServerAuth.ts
import { cookies } from "next/headers";
import { client } from "@/lib/api";

export async function getServerAuth() {
  // Read the access token from Next.js cookies
  const cookieReader = await cookies();
  const accessToken = cookieReader.get("access_token")?.value;

  console.log("SERVER:");

  if (!accessToken) return null;

  // Forward the access token cookie to your backend
  const res = await client?.auth.me.$get({
    credentials: "include",
  });

  if (res?.status === 200) {
    const data = await res.json();
    return data.user;
  }

  return null;
}
