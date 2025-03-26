import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { client } from "#lib/api";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");

  await client.auth.logout.$post();

  return NextResponse.redirect(new URL("/", request.url));
}
