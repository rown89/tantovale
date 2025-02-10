"use server";
import { client } from "@/lib/api";

import { UserSchema } from "@workspace/server/schema";
import { LoginActionResponse, LoginFormData } from "./types";

export async function submitLogin(
  prevState: LoginActionResponse | null,
  formData: FormData,
): Promise<LoginActionResponse> {
  try {
    const rawData: LoginFormData = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const validateData = UserSchema.safeParse(rawData);

    if (!validateData.success) {
      return {
        success: false,
        message: "Check your credentials",
        inputs: rawData,
        errors: validateData.error.flatten().fieldErrors,
      };
    }

    const response = await client().v1?.login.$post({
      json: {
        email: rawData.email,
        password: rawData.password,
      },
    });

    if (response?.status !== 200) {
      const errorData = await response?.json();

      return {
        success: false,
        message: errorData?.message || "An error occurred",
      };
    }

    return {
      success: true,
      message: "Correctly logged-in",
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      message: "An unexpected error occurred with login form",
    };
  }
}
