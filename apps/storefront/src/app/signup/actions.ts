"use server";

import { UserSchema } from "@workspace/server/extended_schemas";
import { client } from "@workspace/server/client-rpc";

import { SignupActionResponse, SignupFormData } from "./types";

export async function signupAction(
  prevState: SignupActionResponse | null,
  formData: FormData,
): Promise<SignupActionResponse> {
  try {
    const rawData: SignupFormData = {
      username: formData.get("username") as string,
      name: formData.get("name") as string,
      surname: formData.get("surname") as string,
      gender: formData.get("gender") as "male" | "female",
      city: Number(formData.get("city")),
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      privacy_policy: Boolean(formData.get("privacy_policy")) as boolean,
      marketing_policy: Boolean(formData.get("marketing_policy")) as boolean,
    };

    const validatedFields = UserSchema.safeParse(rawData);

    if (!validatedFields.success) {
      return {
        success: false,
        message: "",
        inputs: rawData,
        errors: validatedFields.error.flatten().fieldErrors,
      };
    }

    const response = await client?.signup.$post({
      json: validatedFields.data,
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
    } else if (response?.status === 500) {
      return {
        success: false,
        inputs: rawData,
        message: data?.message || "Internal Server Error",
      };
    } else {
      return {
        success: true,
        inputs: rawData,
        message: "Signup successful! Check your email for verification.",
      };
    }
  } catch (error) {
    return {
      success: false,
      message: "An unexpected error occurred with signup form",
    };
  }
}
