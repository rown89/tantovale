"use server";

import { client } from "@/lib/api";
import { LoginActionResponse, LoginFormData } from "./types";
import { cookies } from "next/headers";
import { UserSchema } from "@workspace/server/schema";
import { getAuthTokenOptions } from "@workspace/server/lib/getAuthTokenOptions";
import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";
import { verify } from "hono/jwt";
import { User } from "@/context/AuthProvider";

export async function submitLogin(
  prevState: LoginActionResponse | null,
  formData: FormData,
): Promise<LoginActionResponse> {
  try {
    const rawData: LoginFormData = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const validateData = UserSchema.omit({ username: true }).safeParse(rawData);
    if (!validateData.success) {
      return {
        success: false,
        message: "Check your credentials",
        inputs: rawData,
        errors: validateData.error.flatten().fieldErrors,
      };
    }

    const response = await client?.login.$post({
      json: {
        email: rawData.email,
        password: rawData.password,
      },
    });

    const data = await response?.json();

    if (response?.status !== 200) {
      return {
        success: false,
        message: data?.message || "An error occurred",
      };
    }

    const cookieStore = await cookies();

    cookieStore.set({
      name: "access_token",
      value: data.cookies?.access_token,
      ...(getAuthTokenOptions("access_token") as ResponseCookies),
    });

    cookieStore.set({
      name: "refresh_token",
      value: data.cookies?.refresh_token,
      ...(getAuthTokenOptions("refresh_token") as ResponseCookies),
    });

    // Decode the new access token to update the expiry.
    const user = (await verify(
      data.cookies?.access_token,
      process.env.ACCESS_TOKEN_SECRET!,
    )) as unknown as User;

    return {
      success: true,
      message: "Correctly logged-in",
      user,
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      message: "An unexpected error occurred with login form",
    };
  }
}
