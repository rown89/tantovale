"use server";

import { UserSchema } from "@workspace/server/schema";
import { SignupActionResponse, SignupFormData } from "./types";

export async function signupAction(
  prevState: SignupActionResponse | null,
  formData: FormData,
): Promise<SignupActionResponse> {
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

  // Simulate a delay to show loading state
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Here you would typically create the user in your database
  // For this example, we'll just return a success message
  console.log("User signed up:", validatedFields.data);

  return {
    success: true,
    inputs: rawData,
    message: "Signup successful!",
  };
}
