import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { client } from "@workspace/server/client-rpc";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  return NextResponse.redirect(new URL("/", request.url));
}
