import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { client } from "#lib/api";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "No token provided" });
  }

  const response = await client.verify.email.$get({
    query: { token },
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status !== 200) {
    return NextResponse.json({ error: "Invalid verify email token provided" });
  }

  const cookieHeader = response.headers.get("Set-Cookie");

  if (!cookieHeader) {
    return NextResponse.json({ error: "Invalid token provided" });
  }

  const cookieReader = await cookies();

  cookieHeader.split(/,(?=[^;]+?=)/).forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    const trimmedName = name?.trim();
    const value = rest.join("=").trim();

    if (trimmedName === "access_token" || trimmedName === "refresh_token") {
      console.log(`🔑 Sending pure token: ${value}`);

      // Send only the token value without options
      cookieReader.set(trimmedName, value);
    }
  });

  return NextResponse.redirect(new URL("/", request.url));
}
