import { NextRequest, NextResponse } from "next/server";
import { loginUrl, signupUrl } from "./routes";
import { verifyOrRefreshTokens } from "./utils/verifyOrRefreshTokens";
import { buildCookieHeader } from "./utils/buildCookieHeader";
import { logoutAndClearCookies } from "./utils/logoutAndClearCookies";

const NODE_ENV = process.env.NODE_ENV;
const SERVER_HOSTNAME = process.env.NEXT_PUBLIC_SERVER_HOSTNAME;
const SERVER_PORT = process.env.NEXT_PUBLIC_SERVER_PORT;
const isProductionMode = NODE_ENV === "production";

const serverUrl = `${isProductionMode ? "https" : "http"}://${SERVER_HOSTNAME}:${SERVER_PORT}`;

const restrictedPaths = ["/protected", "/profile"];

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const { pathname } = nextUrl;

  const accessToken = req.cookies.get("access_token")?.value?.split(";")[0];
  const refreshToken = req.cookies.get("refresh_token")?.value?.split(";")[0];
  const cookieHeader = buildCookieHeader(accessToken, refreshToken);

  // If user is on login or signup and already authenticated, redirect to home.
  if (
    (pathname === loginUrl || pathname === signupUrl) &&
    accessToken &&
    refreshToken
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // For restricted routes, verify that both tokens exist.
  if (restrictedPaths.includes(pathname)) {
    console.log("Middleware: accessing protected route", pathname);
    if (!accessToken && !refreshToken) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Verify tokens and try to refresh if needed.
    const tokenValidity = await verifyOrRefreshTokens({
      cookieHeader,
      accessToken,
      serverUrl,
    });
    if (!tokenValidity) {
      // If refresh fails, log out the user and clear cookies.
      await logoutAndClearCookies({ cookieHeader, serverUrl });
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}
