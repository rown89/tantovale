import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildCookieHeader } from "#utils/buildCookieHeader";
import { logoutAndClearCookies } from "#utils/logoutAndClearCookies";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  const cookieHeader = buildCookieHeader(accessToken, refreshToken);

  await logoutAndClearCookies({ cookieHeader });

  return NextResponse.redirect(new URL("/", request.url));
}
