import * as z from "zod";

export const EmailVerifySchema = z.object({
  email: z.string().email(),
});

export const createEmailVerifySchema = EmailVerifySchema;
