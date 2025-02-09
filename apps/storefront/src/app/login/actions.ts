"use server";

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
        message: "Something is wrong",
        inputs: rawData,
        errors: validateData.error.flatten().fieldErrors,
      };
    }

    return {
      success: true,
      message: "Correctly logged-in",
    };
  } catch (error) {
    return {
      success: false,
      message: "An unexpected error occurred with login form",
    };
  }
}
