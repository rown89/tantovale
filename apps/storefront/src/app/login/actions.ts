"use server";

import { client } from "@workspace/server/client-rpc";
import { LoginActionResponse, LoginFormData } from "./types";
import { cookies } from "next/headers";
import { UserSchema } from "@workspace/server/extended_schemas";

export async function submitLogin(
  prevState: LoginActionResponse | null,
  formData: FormData,
): Promise<LoginActionResponse> {
  const rawData: LoginFormData = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  try {
    const validateData = UserSchema.pick({
      email: true,
      password: true,
    }).safeParse(rawData);

    if (!validateData.success) {
      return {
        success: false,
        message: "Check your credentials",
        inputs: rawData,
        errors: validateData.error.flatten().fieldErrors,
      };
    }

    const loginResponse = await client?.login.$post({ json: rawData });

    if (!loginResponse.ok) {
      const data = await loginResponse?.json();

      return {
        success: false,
        message: data?.message || "An error occurred",
      };
    }

    const cookieHeader = loginResponse.headers.get("Set-Cookie");

    if (!cookieHeader) {
      return {
        success: false,
        inputs: rawData,
        message: "No cookie set",
      };
    }

    const cookieReader = await cookies();

    cookieHeader.split(/,(?=[^;]+?=)/).forEach((cookie) => {
      const [pair, ...rest] = cookie.split(";");
      const [name, value] = pair?.split("=") ?? [];
      const trimmedName = name?.trim();
      const trimmedValue = value?.trim();

      if (trimmedName === "access_token" || trimmedName === "refresh_token") {
        console.log(`🔑 Setting cookie: ${trimmedName} = ${trimmedValue}`);
        if (trimmedValue) {
          cookieReader.set(trimmedName, trimmedValue);
        }
      }
    });

    const loginData = await loginResponse.json();
    const { user } = loginData;

    return {
      success: true,
      message: "Correctly logged-in",
      user,
    };
  } catch (error) {
    console.error(error);

    return {
      success: false,
      inputs: rawData,
      message: "An unexpected error occurred with login form",
    };
  }
}
