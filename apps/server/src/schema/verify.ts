import * as z from "zod";

const EmailVerifySchema = z.object({
  email: z.string().email(),
});

const createEmailVerifySchema = EmailVerifySchema;

export { EmailVerifySchema };

export { createEmailVerifySchema };
