"use server";

import { UserSchema } from "@workspace/server/schema";
import { SignupActionResponse, SignupFormData } from "./types";
import { client } from "@/lib/api";

export async function signupAction(
  prevState: SignupActionResponse | null,
  formData: FormData,
): Promise<SignupActionResponse> {
  try {
    const rawData: SignupFormData = {
      username: formData.get("username") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const validatedFields = UserSchema.safeParse({
      username: formData.get("username"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!validatedFields.success) {
      return {
        success: false,
        message: "",
        inputs: rawData,
        errors: validatedFields.error.flatten().fieldErrors,
      };
    }

    const response = await client?.signup.$post({
      json: {
        username: rawData.username,
        email: rawData.email,
        password: rawData.password,
      },
    });

    const data = await response?.json();

    if (response?.status === 422) {
      return {
        success: false,
        inputs: rawData,
        message: data?.message || "An error occurred",
        errors: {
          username: ["Username already exist"],
        },
      };
    } else if (response?.status === 409) {
      return {
        success: false,
        inputs: rawData,
        message: data?.message || "An error occurred",
        errors: {
          email: ["Email already exist"],
        },
      };
    } else {
      return {
        success: true,
        inputs: rawData,
        message: "Signup successful!",
      };
    }
  } catch (error) {
    console.error("signup form err: ", error);

    return {
      success: false,
      message: "An unexpected error occurred with signup form",
    };
  }
}
