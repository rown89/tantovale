"use server";

import { client } from "@/lib/api";
import { LoginActionResponse, LoginFormData } from "./types";
import { cookies } from "next/headers";
import { UserSchema } from "@workspace/server/schema";

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

    const setCookieHeader: string = response.headers.get("Set-Cookie");

    if (!setCookieHeader) {
      return {
        success: false,
        inputs: rawData,
        message: "No cookie set",
      };
    }

    const cookieReader = await cookies();

    setCookieHeader.split(/,(?=[^;]+?=)/).forEach((cookie) => {
      const [name, ...rest] = cookie.split("=");
      const trimmedName = name?.trim();
      const value = rest.join("=").trim(); // Preserve values with `=` (e.g., JWTs)

      if (trimmedName === "auth_token" || trimmedName === "refresh_token") {
        console.log(`🔑 Setting cookie: ${trimmedName} = ${value}`);
        cookieReader.set(trimmedName, value, { path: "/" });
      }
    });

    return {
      success: true,
      message: "Correctly logged-in",
      user: {
        id: data.user.id,
        username: data.user.username,
        email_verified: data.user.email_verified,
        phone_verified: data.user.phone_verified,
      },
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      message: "An unexpected error occurred with login form",
    };
  }
}
