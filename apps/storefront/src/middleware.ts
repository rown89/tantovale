import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { loginUrl, signupUrl } from "./routes";

const restrictedPaths = ["/protected", "/profile"];

const NODE_ENV = process.env.NODE_ENV;
const NEXT_PUBLIC_SERVER_HOSTNAME = process.env.NEXT_PUBLIC_SERVER_HOSTNAME;
const NEXT_PUBLIC_SERVER_PORT = process.env.NEXT_PUBLIC_SERVER_PORT;
const isProductionMode = NODE_ENV === "production";

const serverUrl = `${isProductionMode ? "http" : "http"}://${NEXT_PUBLIC_SERVER_HOSTNAME}:${NEXT_PUBLIC_SERVER_PORT}`;

async function logoutUser(cookieHeader: string) {
  const LogoutRequest = new Request(`${serverUrl}/auth/logout`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
    },
  });

  await fetch(LogoutRequest);

  const cookieReader = await cookies();
  cookieReader.delete("access_token");
  cookieReader.delete("refresh_token");
}

export async function middleware(req: NextRequest, res: NextResponse) {
  const { nextUrl } = req;
  const { pathname } = nextUrl;
  const cookieReader = await cookies();

  const access_token = req.cookies.get("access_token")?.value?.split(";")[0];
  const refresh_token = req.cookies.get("refresh_token")?.value?.split(";")[0];

  // Manually build a Cookie header string
  const cookieHeader = `access_token=${access_token}; refresh_token=${refresh_token}`;

  const response = NextResponse.next({
    headers: {
      Cookie: cookieHeader,
    },
  });

  if (pathname === loginUrl || pathname === signupUrl) {
    if (access_token && refresh_token) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Protected routes logic
  if (restrictedPaths.includes(pathname)) {
    console.log("\nmiddleware protected route\n");

    // If one or both tokens are missing, redirect to root.
    if (!access_token || !refresh_token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Verify the token and get the expiration time
    const verifyTokenRequest = new Request(`${serverUrl}/auth/verify`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
      },
    });

    const verifyResponse = await fetch(verifyTokenRequest);

    if (!verifyResponse.ok) {
      // If token is not valid try a refresh
      const RefreshTokenRequest = new Request(`${serverUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          Cookie: cookieHeader,
        },
      });

      const refreshTokenResponse = await fetch(RefreshTokenRequest);

      if (!refreshTokenResponse.ok) {
        // If refresh fails, clear both cookies, logout user and redirect.
        await logoutUser(cookieHeader);
        return NextResponse.redirect(new URL("/", req.url));
      } else {
        const data = await refreshTokenResponse.json();

        const newAccessToken = data.access_token;
        const newRefreshToken = data.refresh_token;

        cookieReader.set("access_token", newAccessToken);
        cookieReader.set("refresh_token", newRefreshToken);
      }
    }
  }

  return response;
}
