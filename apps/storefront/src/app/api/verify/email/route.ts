import { NextRequest, NextResponse } from "next/server";
import { client } from "@/lib/api";
import { cookies } from "next/headers";

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL;
const STOREFRONT_PORT = process.env.NEXT_PUBLIC_STOREFRONT_PORT;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "No token provided" });
  }

  const response = await client.verify.email.$get({
    query: { token },
  });

  if (response.status !== 200) {
    return NextResponse.json({ error: "Invalid token provided" });
  }

  const setCookieHeader = response.headers.get("Set-Cookie");

  if (!setCookieHeader) {
    return NextResponse.json({ error: "Invalid token provided" });
  }

  const cookieReader = await cookies();

  setCookieHeader.split(/,(?=[^;]+?=)/).forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    const trimmedName = name?.trim();
    const value = rest.join("=").trim(); // Preserve values with `=` (e.g., JWTs)

    if (trimmedName === "auth_token" || trimmedName === "refresh_token") {
      console.log(`🔑 Setting cookie: ${trimmedName} = ${value}`);
      cookieReader.set(trimmedName, value, { path: "/" });
    }
  });

  return NextResponse.redirect(`${STOREFRONT_URL}:${STOREFRONT_PORT}/`);
}
