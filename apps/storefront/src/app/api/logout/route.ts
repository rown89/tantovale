import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildCookieHeader } from "#utils/buildCookieHeader";
import { logoutAndClearCookies } from "#utils/logoutAndClearCookies";

const NODE_ENV = process.env.NODE_ENV;
const SERVER_HOSTNAME = process.env.NEXT_PUBLIC_SERVER_HOSTNAME;
const SERVER_PORT = process.env.NEXT_PUBLIC_SERVER_PORT;
const isProductionMode = NODE_ENV === "production";

const serverUrl = `${isProductionMode ? "https" : "http"}://${SERVER_HOSTNAME}:${SERVER_PORT}`;

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  const cookieHeader = buildCookieHeader(accessToken, refreshToken);

  await logoutAndClearCookies({
    cookieHeader,
    serverUrl,
  });

  return NextResponse.redirect(new URL("/", request.url));
}
