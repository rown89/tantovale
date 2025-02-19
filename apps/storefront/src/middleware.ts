import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest, res: NextResponse) {
  const { cookies } = req;

  const access_token = cookies.get("access_token");
  const refresh_token = cookies.get("refresh_token");

  const restrictedPaths = ["/protected", "/dashboard"];
}
