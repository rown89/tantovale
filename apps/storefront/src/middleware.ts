import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { client } from "@/lib/api";
import { loginUrl } from "./routes";
import { getAuthTokenOptions } from "@workspace/server/lib/getAuthTokenOptions";
import { ResponseCookie } from "@edge-runtime/cookies";

const restrictedPaths = ["/protected", "/profile"];

export async function middleware(req: NextRequest, res: NextResponse) {
  const { nextUrl } = req;
  const { pathname } = nextUrl;

  const cookieReader = await cookies();

  // Retrieve both tokens.
  const access_token = cookieReader.get("access_token")?.value;
  const refresh_token = cookieReader.get("refresh_token")?.value;

  if (access_token && refresh_token) {
    const me = await client.auth.me.$get();
    console.log("ME: ", await me.json());

    if (pathname === loginUrl) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Only operate on protected routes.
  if (restrictedPaths.includes(pathname)) {
    console.log("\nmiddleware protected route");

    // If one or both tokens are missing, redirect to root.
    if (!access_token || !refresh_token) {
      console.log("\nMissing token(s). Redirecting to login page.");
      return NextResponse.redirect(new URL("/login", req.url));
    }

    try {
      // Attempt to refresh the token.
      const refreshResponse = await client.auth.refresh.$post({
        credentials: "include",
      });

      if (refreshResponse.status === 200) {
        const data = await refreshResponse.json();

        const newAccessToken = data.access_token;
        const newRefreshToken = data.refresh_token;

        // Get cookie options
        const accessTokenOptions = getAuthTokenOptions(
          "access_token",
        ) as ResponseCookie;
        const refreshTokenOptions = getAuthTokenOptions(
          "refresh_token",
        ) as ResponseCookie;

        cookieReader.set("access_token", newAccessToken, accessTokenOptions);
        cookieReader.set("refresh_token", newRefreshToken, refreshTokenOptions);
      } else {
        console.log("HERE");
        await client.auth.logout.$post({
          headers: {
            Cookie: `access_token=${access_token}; refresh_token=${refresh_token}`,
          },
        });

        // If refresh fails, clear both cookies and redirect.
        cookieReader.delete("access_token");
        cookieReader.delete("refresh_token");

        return NextResponse.redirect(new URL("/", req.url));
      }
    } catch (error) {
      await client.auth.logout.$post();
      console.error("refresh the token error: ", error);
      // If error, clear both cookies and redirect.
      cookieReader.delete("access_token");
      cookieReader.delete("refresh_token");

      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}
