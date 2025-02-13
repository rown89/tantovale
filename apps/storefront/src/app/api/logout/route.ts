import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL;
const STOREFRONT_PORT = process.env.NEXT_PUBLIC_STOREFRONT_PORT;

const access_token = "access_token";
const refresh_token = "refresh_token";

export async function GET() {
  // Tell Next.js to purge the entire cache, no stale data should stay after the redirect back to the index page.
  revalidatePath("/", "layout");

  // You can redirect back to the index, or to another page such as /login
  const destination = `${STOREFRONT_URL}:${STOREFRONT_PORT}/`;

  // Clear the session cookies.
  const cookieReader = await cookies();
  cookieReader.delete(access_token);
  cookieReader.delete(refresh_token);

  return NextResponse.redirect(destination, {
    headers: {
      // Some browsers accept this directive to clear cookies and other data.
      "Clear-Site-Data": `"*"`,
      // Next.js accepts this directive to clear its own client fetch cache.
      "Cache-Control": "no-store",
    },
  });
}
