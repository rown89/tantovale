import { NextRequest, NextResponse } from "next/server";
import { client } from "#lib/api";
import { cookies } from "next/headers";

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

  const cookieHeader = response.headers.get("Set-Cookie");

  if (!cookieHeader) {
    return NextResponse.json({ error: "Invalid token provided" });
  }

  const cookieReader = await cookies();

  cookieHeader.split(/,(?=[^;]+?=)/).forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    const trimmedName = name?.trim();
    const value = rest.join("=").trim(); // Preserve values with `=` (e.g., JWTs)

    if (trimmedName === "access_token" || trimmedName === "refresh_token") {
      console.log(`🔑 Setting cookie: ${trimmedName} = ${value}`);

      cookieReader.set(trimmedName, value, { path: "/" });
    }
  });

  return NextResponse.redirect(`/`);
}
