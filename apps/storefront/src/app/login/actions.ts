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
      json: rawData,
    });

    if (response?.status !== 200) {
      const data = await response?.json();

      console.log(data);

      return {
        success: false,
        message: data?.message || "An error occurred",
      };
    } else {
      const cookieHeader = response.headers.get("Set-Cookie");

      if (!cookieHeader) {
        return {
          success: false,
          inputs: rawData,
          message: "No cookie set",
        };
      }

      const cookieReader = await cookies();

      cookieHeader.split(/,(?=[^;]+?=)/).forEach((cookie) => {
        // Split the cookie string by semicolon; the first part is the key-value pair.
        const [pair, ...rest] = cookie.split(";");
        const [name, value] = pair?.split("=") ?? [];
        const trimmedName = name?.trim();
        const trimmedValue = value?.trim();

        if (trimmedName === "access_token" || trimmedName === "refresh_token") {
          console.log(`🔑 Setting cookie: ${trimmedName} = ${trimmedValue}`);
          if (trimmedValue) {
            cookieReader.set(trimmedName, trimmedValue, { path: "/" });
          }
        }
      });

      const data = await response.json();
      const { user } = data;
      const { id, username, email_verified, phone_verified } = user;

      return {
        success: true,
        message: "Correctly logged-in",
        user: {
          id,
          username,
          email_verified,
          phone_verified,
        },
      };
    }
  } catch (error) {
    console.log(error);
    return {
      success: false,
      message: "An unexpected error occurred with login form",
    };
  }
}
