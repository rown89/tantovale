import { getTokenOptions } from "@workspace/server/lib/getTokenOptions";
import { isDevelopmentMode } from "@workspace/server/lib/constants";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL;
const STOREFRONT_PORT = process.env.NEXT_PUBLIC_STOREFRONT_PORT;
const SERVER_HOSTNAME = process.env.SERVER_HOSTNAME;
const SERVER_PORT = process.env.SERVER_PORT;
const SERVER_VERSION = process.env.SERVER_VERSION;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "No token provided" });
  }

  const data = await fetch(
    `http${isDevelopmentMode ? "" : "s"}://${SERVER_HOSTNAME}:${SERVER_PORT}/${SERVER_VERSION}/verify/email?token=${token}`,
  );

  const { access_token, refresh_token } = await data.json();

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "Invalid token provided" });
  }

  // Create a redirect response and attach cookies directly.
  const destination = `${STOREFRONT_URL}:${STOREFRONT_PORT}/`;
  const response = NextResponse.redirect(destination);

  const cookieStore = await cookies();

  // Set the cookies on the response
  cookieStore.set({
    name: "access_token",
    value: access_token,
    ...(getTokenOptions(
      "access_token",
      process.env.NEXT_PUBLIC_STOREFRONT_URL!,
    ) as any),
  });

  cookieStore.set({
    name: "refresh_token",
    value: refresh_token,
    ...(getTokenOptions(
      "refresh_token",
      process.env.NEXT_PUBLIC_STOREFRONT_URL!,
    ) as any),
  });

  return response;
}
