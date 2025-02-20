import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL;
const STOREFRONT_PORT = process.env.NEXT_PUBLIC_STOREFRONT_PORT;

export async function GET() {
  try {
    const cookieReader = await cookies();

    cookieReader.delete("access_token");
    cookieReader.delete("refresh_token");
  } catch (error) {
    console.log("Error logging out:", error);
  }

  const destination = `${STOREFRONT_URL}:${STOREFRONT_PORT}/`;

  return NextResponse.redirect(destination);
}
