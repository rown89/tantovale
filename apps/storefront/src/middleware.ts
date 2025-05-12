import { NextRequest, NextResponse } from "next/server";
import { loginUrl, signupUrl } from "./routes";

const restrictedPaths = ["/auth"];

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const { pathname } = nextUrl;

  // TODO: Remove this once we have a production environment
  if (process.env.NODE_ENV === "production" && pathname === "/") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const accessToken = req.cookies.get("access_token")?.value;
  const refreshToken = req.cookies.get("refresh_token")?.value;

  const hasTokens = accessToken && refreshToken;

  try {
    // If the user is authenticated
    if (hasTokens) {
      if (pathname === loginUrl || pathname === signupUrl) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    // If user is not authenticated and tries to access a protected route
    else {
      if (restrictedPaths.find((item) => pathname.includes(item))) {
        return NextResponse.redirect(new URL("/login", req.url));
      }
    }
  } catch (error) {
    console.error("Auth Middleware Error:", error);
  }

  const headers = new Headers(req.headers);
  headers.set("x-current-path", req.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers,
    },
  });
}
