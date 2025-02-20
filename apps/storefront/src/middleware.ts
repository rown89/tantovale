import { NextRequest, NextResponse } from "next/server";
import { client } from "./lib/api";

const restrictedPaths = ["/protected", "/profile"];

export async function middleware(req: NextRequest) {
  const { cookies, nextUrl } = req;
  const { pathname } = nextUrl;

  const access_token = cookies.get("access_token");

  if (restrictedPaths.includes(pathname)) {
    if (!access_token) return NextResponse.redirect(new URL("/", req.url));

    try {
      /*   
        const response = await client?.auth.me.$get({
        credentials: "include",
        headers: {
          Cookie: `access_token=${access_token}`,
        },
        });

        if (response?.status !== 200) {
          return NextResponse.redirect(new URL("/", req.url));
        }  
      */
    } catch (error) {
      console.error("Error fetching user data:", error);
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next({
    request: {
      headers: req.headers,
    },
  });
}
