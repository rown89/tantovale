import { NextRequest, NextResponse } from "next/server";
import { loginUrl, signupUrl } from "./routes";
import { buildCookieHeader } from "./utils/buildCookieHeader";
import { logoutAndClearCookies } from "./utils/logoutAndClearCookies";
import { verify } from "hono/jwt";
import { cookies } from "next/headers";

const NODE_ENV = process.env.NODE_ENV ?? "development";
const SERVER_HOSTNAME = process.env.NEXT_PUBLIC_SERVER_HOSTNAME ?? "";
const SERVER_PORT = process.env.NEXT_PUBLIC_SERVER_PORT ?? "";
const isProductionMode = NODE_ENV === "production";

const serverUrl = `${isProductionMode ? "https" : "http"}://${SERVER_HOSTNAME}:${SERVER_PORT}`;

const restrictedPaths = ["/protected", "/profile"];

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const { pathname } = nextUrl;

  const accessToken = req.cookies.get("access_token")?.value;
  const refreshToken = req.cookies.get("refresh_token")?.value;
  const cookieHeader = buildCookieHeader(accessToken, refreshToken);

  try {
    // If the user is authenticated
    if (accessToken && refreshToken) {
      if (pathname === loginUrl || pathname === signupUrl) {
        return NextResponse.redirect(new URL("/", req.url));
      }

      const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET ?? "";

      // Verify access token
      const decoded = await verify(accessToken, ACCESS_TOKEN_SECRET);
      if (!decoded?.exp) throw new Error("Invalid token");

      const now = Math.floor(Date.now() / 1000);

      // If token expired, try a refresh
      if (now >= decoded.exp) {
        console.warn("Access token expired.");

        const refreshRequest = new Request(`${serverUrl}/auth/refresh`, {
          method: "POST",
          headers: { Cookie: cookieHeader },
        });

        const refreshResponse = await fetch(refreshRequest);

        if (!refreshResponse.ok) {
          await logoutAndClearCookies({ cookieHeader, serverUrl });
          return NextResponse.redirect(new URL("/login", req.url));
        }
      }
    }
    // If user is not authenticated and tries to access a protected route
    else {
      if (restrictedPaths.includes(pathname)) {
        return NextResponse.redirect(new URL("/login", req.url));
      }
    }
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    // await logoutAndClearCookies({ cookieHeader, serverUrl });
  }

  return NextResponse.next();
}
